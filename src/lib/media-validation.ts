import fs from "node:fs";
import path from "node:path";
import { interviewInputSchema, type InterviewInput } from "./interview-schema";

export const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");

const VIDEO_EXT = [".mp4", ".mov", ".webm", ".m4v"];
const AUDIO_EXT = [".wav", ".mp3", ".m4a", ".ogg"];

export type ValidationResult = {
  errors: string[];
  warnings: string[];
  input?: InterviewInput;
};

/** Resolve an input path and make sure it stays inside public/. */
export function resolvePublicPath(p: string): string {
  const abs = path.resolve(PROJECT_ROOT, p);
  const rel = path.relative(PUBLIC_DIR, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Path "${p}" must be inside the public/ folder`);
  }
  return abs;
}

/** "public/media/a.mp4" -> "media/a.mp4" (what staticFile() expects). */
export function toStaticPath(p: string): string {
  return path.relative(PUBLIC_DIR, resolvePublicPath(p)).split(path.sep).join("/");
}

export function loadInput(inputFile: string): ValidationResult {
  const result: ValidationResult = { errors: [], warnings: [] };
  const abs = path.resolve(PROJECT_ROOT, inputFile);

  if (!fs.existsSync(abs)) {
    result.errors.push(`Input file not found: ${inputFile}`);
    return result;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch (e) {
    result.errors.push(`Invalid JSON in ${inputFile}: ${(e as Error).message}`);
    return result;
  }

  const parsed = interviewInputSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      result.errors.push(`${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    return result;
  }
  result.input = parsed.data;
  return result;
}

function checkFile(
  label: string,
  p: string,
  exts: string[],
  result: ValidationResult,
  opts: { mustExist: boolean; missingHint?: string },
) {
  let abs: string;
  try {
    abs = resolvePublicPath(p);
  } catch (e) {
    result.errors.push(`${label}: ${(e as Error).message}`);
    return;
  }
  if (!exts.includes(path.extname(abs).toLowerCase())) {
    result.errors.push(`${label}: unsupported format "${path.extname(abs)}" (expected ${exts.join(", ")})`);
    return;
  }
  if (!opts.mustExist) return;
  if (!fs.existsSync(abs)) {
    result.errors.push(`${label}: file not found at ${p}${opts.missingHint ? ` - ${opts.missingHint}` : ""}`);
    return;
  }
  try {
    fs.accessSync(abs, fs.constants.R_OK);
  } catch {
    result.errors.push(`${label}: file is not readable (${p})`);
    return;
  }
  if (fs.statSync(abs).size === 0) {
    result.errors.push(`${label}: file is empty (${p})`);
  }
}

/**
 * @param stage "voice" skips the existence check of the spoken audio (it is about to be generated).
 */
export function validateInput(
  inputFile: string,
  stage: "voice" | "render" = "render",
): ValidationResult {
  const result = loadInput(inputFile);
  if (!result.input) return result;
  const input = result.input;
  const audioMustExist = stage === "render";
  const hint = "run `pnpm generate:voice` first";

  input.turns.forEach((turn, i) => {
    const n = i + 1;
    checkFile(`turns[${i}].answer.mediaPath`, turn.answer.mediaPath, turn.answer.kind === "video" ? VIDEO_EXT : AUDIO_EXT, result, { mustExist: true });
    checkFile(`turns[${i}].question.audioPath`, turn.question.audioPath, AUDIO_EXT, result, { mustExist: audioMustExist, missingHint: hint });
    if (input.branding.showCaptions && !turn.answer.transcript?.trim()) {
      result.errors.push(
        `Answer ${n} has no transcript but captions are on. Add the transcript or set branding.showCaptions to false.`,
      );
    }
  });
  checkFile("signOff.audioPath", input.signOff.audioPath, AUDIO_EXT, result, { mustExist: audioMustExist, missingHint: hint });

  return result;
}
