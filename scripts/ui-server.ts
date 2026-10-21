import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { loadEnvLocal } from "../src/lib/env";
import { INTERVIEW_CONFIG, MAX_TURNS } from "../src/lib/interview-config";
import { PROJECT_ROOT } from "../src/lib/media-validation";
import { generateSpeech } from "../src/tts/generate-speech";

loadEnvLocal();

const PORT = Number(process.env.UI_PORT ?? 4000);
// Local only by default. Set UI_HOST=0.0.0.0 to let others on your network use it.
const HOST = process.env.UI_HOST ?? "127.0.0.1";
const MAX_ANSWER_BYTES = 200 * 1024 * 1024;

const ANSWER_DIR = path.join(PROJECT_ROOT, "public", "media", "uploads");
const AUDIO_DIR = path.join(PROJECT_ROOT, "public", "audio");
const RAW_DIR = path.join(PROJECT_ROOT, "generated", "raw");
const TTS_DIR = path.join(PROJECT_ROOT, "generated", "tts-cache");
const JOB_DIR = path.join(PROJECT_ROOT, "generated");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "output");
const TSX_CLI = path.join(PROJECT_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const REMOTION_CLI = path.join(PROJECT_ROOT, "node_modules", "@remotion", "cli", "remotion-cli.js");

type Job = {
  id: string;
  status: "running" | "done" | "error";
  step: "voice" | "render" | "done";
  progress: number;
  message: string;
  outputUrl?: string;
  seconds?: number;
};

const jobs = new Map<string, Job>();
const isBusy = () => [...jobs.values()].some((j) => j.status === "running");

const json = (res: http.ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

function readBody(req: http.IncomingMessage, limit = 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("Request too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function readJson(req: http.IncomingMessage): Promise<Record<string, any>> {
  return JSON.parse(await readBody(req));
}

/** Run a process to completion and capture its output. */
function exec(cmd: string, args: string[]): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: PROJECT_ROOT, env: process.env });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, out, err }));
  });
}

/** Remotion ships its own ffmpeg, so testers don't need to install one. */
const ffmpeg = (args: string[]) => exec(process.execPath, [REMOTION_CLI, "ffmpeg", "-hide_banner", "-y", ...args]);

/** Only files already under public/media may be used in a render. */
function resolveMedia(videoPath: string): string | null {
  const abs = path.resolve(PROJECT_ROOT, videoPath);
  const mediaRoot = path.join(PROJECT_ROOT, "public", "media") + path.sep;
  return abs.startsWith(mediaRoot) && fs.existsSync(abs) ? abs : null;
}

// ---- Text to speech (cached so the same line is only synthesised once) -------

const ttsInflight = new Map<string, Promise<string>>();
const ttsKey = (text: string) => createHash("sha1").update(text).digest("hex").slice(0, 16);
const ttsFile = (text: string) => path.join(TTS_DIR, `${ttsKey(text)}.wav`);

function ensureTts(text: string): Promise<string> {
  const file = ttsFile(text);
  if (fs.existsSync(file) && fs.statSync(file).size > 100) return Promise.resolve(file);
  let p = ttsInflight.get(file);
  if (!p) {
    fs.mkdirSync(TTS_DIR, { recursive: true });
    p = generateSpeech({ text, outputPath: file })
      .then(() => file)
      .finally(() => ttsInflight.delete(file));
    ttsInflight.set(file, p);
  }
  return p;
}

async function handleTts(req: http.IncomingMessage, res: http.ServerResponse) {
  const text = String((await readJson(req)).text ?? "").trim();
  if (!text || text.length > 300) return json(res, 400, { error: "Text must be 1-300 characters" });
  try {
    await ensureTts(text);
    json(res, 200, { url: `/tts/${ttsKey(text)}.wav` });
  } catch (e) {
    json(res, 500, { error: (e as Error).message });
  }
}

// ---- Answers: save, convert, transcribe --------------------------------------

// Transcriptions run one at a time so several answers can't overload the CPU.
let transcribeQueue: Promise<unknown> = Promise.resolve();

function transcribeFile(abs: string): Promise<{ text: string; duration: number }> {
  const run = async () => {
    const python = (process.env.PYTHON_BIN ?? "python").split(" ").filter(Boolean);
    const { out, err } = await exec(python[0], [...python.slice(1), "-I", path.join(PROJECT_ROOT, "scripts", "transcribe.py"), abs]);
    let result: any;
    try {
      result = JSON.parse(out.trim().split(/\r?\n/).pop() ?? "");
    } catch {
      throw new Error(/No module named/.test(err) ? "Run: pip install faster-whisper" : err.trim().split(/\r?\n/).pop() || "no output");
    }
    if (result.error) throw new Error(result.error);
    return result as { text: string; duration: number };
  };
  const p = transcribeQueue.then(run);
  transcribeQueue = p.catch(() => undefined);
  return p;
}

function saveBody(req: http.IncomingMessage, target: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let received = 0;
    const out = fs.createWriteStream(target);
    req.on("data", (c: Buffer) => {
      received += c.length;
      if (received > MAX_ANSWER_BYTES) {
        out.destroy();
        reject(new Error("Recording is too large"));
        req.destroy();
      }
    });
    req.on("error", reject);
    out.on("error", reject);
    out.on("finish", () => resolve(received));
    req.pipe(out);
  });
}

async function handleAnswer(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  const session = url.searchParams.get("session") ?? "";
  const q = Number(url.searchParams.get("q"));
  const kind = url.searchParams.get("kind");
  if (!/^[a-z0-9]{6,24}$/.test(session)) return json(res, 400, { error: "Bad session" });
  if (!Number.isInteger(q) || q < 1 || q > MAX_TURNS) return json(res, 400, { error: "Bad question number" });
  if (kind !== "video" && kind !== "audio") return json(res, 400, { error: "Bad answer type" });

  const type = req.headers["content-type"] ?? "";
  const rawExt = type.includes("mp4") ? ".mp4" : type.includes("ogg") ? ".ogg" : ".webm";
  fs.mkdirSync(RAW_DIR, { recursive: true });
  fs.mkdirSync(ANSWER_DIR, { recursive: true });
  const raw = path.join(RAW_DIR, `${session}-q${q}-${Date.now()}${rawExt}`);

  try {
    const size = await saveBody(req, raw);
    if (size === 0) throw new Error("The recording was empty");

    // Browser recordings have no duration metadata; re-encoding fixes that and
    // gives Remotion a format it renders reliably.
    const name = `${session}-q${q}-${Date.now()}`;
    const outName = kind === "video" ? `${name}.mp4` : `${name}.wav`;
    const outFile = path.join(ANSWER_DIR, outName);
    const args =
      kind === "video"
        ? ["-i", raw, "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", outFile]
        : ["-i", raw, "-vn", "-ar", "44100", "-ac", "1", outFile];
    const conv = await ffmpeg(args);
    if (conv.code !== 0 || !fs.existsSync(outFile)) {
      throw new Error("Could not process the recording: " + conv.err.trim().split(/\r?\n/).pop());
    }

    let transcript = "";
    let transcriptError: string | undefined;
    let duration: number | null = null;
    try {
      const t = await transcribeFile(outFile);
      transcript = t.text;
      duration = t.duration;
    } catch (e) {
      transcriptError = (e as Error).message;
    }
    json(res, 200, {
      mediaPath: `public/media/uploads/${outName}`,
      url: `/answers/${outName}`,
      kind,
      transcript,
      duration,
      transcriptError,
    });
  } catch (e) {
    json(res, 500, { error: (e as Error).message });
  }
}

// ---- Rendering ---------------------------------------------------------------

// eslint-disable-next-line no-control-regex
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

function runRender(inputFile: string, outFile: string, logFile: string, onData: (text: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [TSX_CLI, path.join("scripts", "render-video.ts"), inputFile, outFile], {
      cwd: PROJECT_ROOT,
      env: process.env,
    });
    const log = fs.createWriteStream(logFile);
    let all = "";
    const handle = (d: Buffer) => {
      const text = d.toString();
      all += text;
      log.write(text);
      onData(text);
    };
    child.stdout.on("data", handle);
    child.stderr.on("data", handle);
    child.on("error", reject);
    child.on("close", (code) => {
      log.end();
      if (code === 0) return resolve();
      // Keep the real error lines (not progress or code excerpts) and point to the full log.
      const lines = stripAnsi(all)
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => /error|timed out|timeout|failed|cannot|enoent/i.test(l) && !/DeprecationWarning|^\d+\s*[│|]/.test(l));
      const summary = lines.slice(-3).join(" ").slice(0, 400) || `Render exited with code ${code}`;
      reject(new Error(`${summary} (full log: ${path.relative(PROJECT_ROOT, logFile)})`));
    });
  });
}

async function runJob(job: Job, input: any, inputFile: string, outFile: string) {
  const started = Date.now();
  try {
    job.message = "Trumpet is getting his voice ready...";
    job.progress = 3;
    // Reuse the spoken lines already synthesised during the interview.
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
    const lines: { text: string; audioPath: string }[] = [...input.turns.map((t: any) => t.question), input.signOff];
    for (const [i, line] of lines.entries()) {
      fs.copyFileSync(await ensureTts(line.text), path.join(PROJECT_ROOT, line.audioPath));
      job.progress = 3 + Math.round(((i + 1) / lines.length) * 12);
    }

    // Transcription and rendering both max out the CPU. Rendering while whisper is still
    // busy can make Remotion time out, so wait for any pending transcription first.
    job.message = "Finishing the transcripts...";
    await transcribeQueue.catch(() => undefined);

    job.step = "render";
    job.message = "Rendering the video...";
    await runRender(inputFile, outFile, inputFile.replace(/\.json$/, ".log"), (t) => {
      const m = [...t.matchAll(/Rendered (\d+)\/(\d+)/g)].pop();
      if (m) job.progress = 15 + Math.round((Number(m[1]) / Number(m[2])) * 80);
      if (/Encoded/.test(t)) job.progress = Math.max(job.progress, 96);
    });

    job.step = "done";
    job.status = "done";
    job.progress = 100;
    job.message = "Your video is ready";
    job.outputUrl = `/files/${path.basename(outFile)}`;
  } catch (e) {
    job.status = "error";
    job.message = (e as Error).message;
  } finally {
    job.seconds = Math.round((Date.now() - started) / 1000);
  }
}

async function handleGenerate(req: http.IncomingMessage, res: http.ServerResponse) {
  if (isBusy()) return json(res, 409, { error: "Another video is still rendering. Try again in a minute." });

  let body: Record<string, any>;
  try {
    body = await readJson(req);
  } catch {
    return json(res, 400, { error: "Invalid request" });
  }

  const rawTurns: any[] = Array.isArray(body.turns) ? body.turns : [];
  if (rawTurns.length < 1 || rawTurns.length > MAX_TURNS) {
    return json(res, 400, { error: `An interview needs 1-${MAX_TURNS} answers.` });
  }

  const id = `${Date.now()}-${randomBytes(2).toString("hex")}`;
  const turns = [];
  for (const [i, t] of rawTurns.entries()) {
    const mediaPath = String(t.mediaPath ?? "").replace(/\\/g, "/");
    const kind = t.kind === "audio" ? "audio" : t.kind === "video" ? "video" : null;
    const questionText = String(t.question ?? "").trim();
    if (!kind || !resolveMedia(mediaPath)) return json(res, 400, { error: `Answer ${i + 1} is missing its recording.` });
    if (!questionText || questionText.length > 300) return json(res, 400, { error: `Question ${i + 1} is invalid.` });
    turns.push({
      question: { text: questionText, audioPath: `public/audio/job-${id}-q${i + 1}.wav` },
      answer: { kind, mediaPath, transcript: String(t.transcript ?? "").trim() },
    });
  }

  const showCaptions = Boolean(body.showCaptions);
  const missing = turns.findIndex((t) => !t.answer.transcript);
  if (showCaptions && missing >= 0) {
    return json(res, 400, { error: `Captions are on, but answer ${missing + 1} has no text. Type it in, or turn captions off.` });
  }

  const input = {
    title: String(body.title || "Founder Interview").slice(0, 80),
    founderName: String(body.founderName || "Founder").slice(0, 60),
    productName: String(body.productName || "Product").slice(0, 60),
    turns,
    signOff: { text: INTERVIEW_CONFIG.signOff, audioPath: `public/audio/job-${id}-signoff.wav` },
    branding: { showCaptions, showIntro: Boolean(body.showIntro) },
  };

  fs.mkdirSync(JOB_DIR, { recursive: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const inputFile = `generated/job-${id}.json`;
  const outFile = `output/job-${id}.mp4`;
  fs.writeFileSync(path.join(PROJECT_ROOT, inputFile), JSON.stringify(input, null, 2));

  const job: Job = { id, status: "running", step: "voice", progress: 0, message: "Starting..." };
  jobs.set(id, job);
  void runJob(job, input, inputFile, outFile);
  json(res, 202, { id });
}

// ---- Static files ------------------------------------------------------------

/** Serve a file with Range support so browser players can seek. */
function serveFile(req: http.IncomingMessage, res: http.ServerResponse, file: string, type: string, download = false) {
  if (!fs.existsSync(file)) {
    res.writeHead(404);
    return res.end("Not found");
  }
  const size = fs.statSync(file).size;
  const headers: Record<string, string | number> = { "Content-Type": type, "Accept-Ranges": "bytes" };
  if (download) headers["Content-Disposition"] = `attachment; filename="${path.basename(file)}"`;

  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` });
      return res.end();
    }
    res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, "Content-Length": size });
  fs.createReadStream(file).pipe(res);
}

const MIME: Record<string, string> = { ".mp4": "video/mp4", ".wav": "audio/wav" };
const inside = (dir: string, name: string, ext: string[]) => {
  const base = path.basename(name);
  return ext.includes(path.extname(base)) ? path.join(dir, base) : null;
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const p = url.pathname;
  try {
    if (req.method === "GET" && p === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(fs.readFileSync(path.join(PROJECT_ROOT, "ui", "index.html")));
    }
    if (req.method === "GET" && p === "/assets/elephant.svg") {
      return serveFile(req, res, path.join(PROJECT_ROOT, "public", "media", "elephant.svg"), "image/svg+xml");
    }
    if (req.method === "GET" && p === "/api/config") {
      return json(res, 200, { ...INTERVIEW_CONFIG, questions: [...INTERVIEW_CONFIG.questions].slice(0, MAX_TURNS) });
    }
    if (req.method === "POST" && p === "/api/tts") return await handleTts(req, res);
    if (req.method === "POST" && p === "/api/answers") return await handleAnswer(req, res, url);
    if (req.method === "POST" && p === "/api/generate") return await handleGenerate(req, res);
    if (req.method === "GET" && p.startsWith("/api/jobs/")) {
      const job = jobs.get(p.slice("/api/jobs/".length));
      return job ? json(res, 200, job) : json(res, 404, { error: "Unknown job" });
    }
    if (req.method === "GET" && p.startsWith("/files/")) {
      const f = inside(OUTPUT_DIR, decodeURIComponent(p.slice(7)), [".mp4"]);
      return f ? serveFile(req, res, f, MIME[".mp4"], url.searchParams.has("download")) : res.writeHead(404).end();
    }
    if (req.method === "GET" && p.startsWith("/answers/")) {
      const f = inside(ANSWER_DIR, decodeURIComponent(p.slice(9)), [".mp4", ".wav"]);
      return f ? serveFile(req, res, f, MIME[path.extname(f)]) : res.writeHead(404).end();
    }
    if (req.method === "GET" && p.startsWith("/tts/")) {
      const f = inside(TTS_DIR, decodeURIComponent(p.slice(5)), [".wav"]);
      return f ? serveFile(req, res, f, MIME[".wav"]) : res.writeHead(404).end();
    }
    res.writeHead(404);
    res.end("Not found");
  } catch (e) {
    if (!res.headersSent) json(res, 500, { error: (e as Error).message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Trumpet video tool running at http://localhost:${PORT}`);
  if (HOST !== "127.0.0.1") console.log(`Shared on your network (host ${HOST}). Anyone who can reach this PC can use it.`);
});
