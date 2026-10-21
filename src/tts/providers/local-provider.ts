import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { TtsProvider, TtsRequest, TtsResult } from "../types";

/**
 * Piper adapter. Feeds text on stdin and writes a WAV file.
 *   PIPER_BIN   executable (default "piper"); may contain args, e.g. "python -m piper"
 *   PIPER_MODEL path to the voice .onnx model
 */
export function createLocalProvider(env: NodeJS.ProcessEnv = process.env): TtsProvider {
  return {
    name: "piper-local",
    async generateSpeech({ text, outputPath }: TtsRequest): Promise<TtsResult> {
      if (!text.trim()) throw new Error("TTS input text is empty");

      const model = env.PIPER_MODEL;
      if (!model) {
        throw new Error("PIPER_MODEL is not set. Copy .env.example to .env.local and point it at a Piper voice (.onnx).");
      }
      const modelAbs = path.resolve(model);
      if (!fs.existsSync(modelAbs)) {
        throw new Error(`Piper voice model not found: ${modelAbs}`);
      }

      const [cmd, ...baseArgs] = (env.PIPER_BIN ?? "piper").split(" ").filter(Boolean);
      const tmpPath = `${outputPath}.tmp.wav`;
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });

      await new Promise<void>((resolve, reject) => {
        const child = spawn(cmd, [...baseArgs, "--model", modelAbs, "--output_file", tmpPath], {
          stdio: ["pipe", "ignore", "pipe"],
        });
        let stderr = "";
        child.stderr.on("data", (d) => (stderr += d));
        child.on("error", (e) =>
          reject(new Error(`Could not start Piper ("${cmd}"): ${e.message}. Is it installed and on PATH, or PIPER_BIN set?`)),
        );
        child.on("close", (code) =>
          code === 0 ? resolve() : reject(new Error(`Piper exited with code ${code}: ${stderr.trim()}`)),
        );
        child.stdin.end(text);
      });

      // Only publish the file if generation succeeded: never leave a corrupt output.
      if (!fs.existsSync(tmpPath) || fs.statSync(tmpPath).size < 100) {
        fs.rmSync(tmpPath, { force: true });
        throw new Error("Piper finished but produced no usable audio");
      }
      fs.renameSync(tmpPath, outputPath);
      return { audioPath: outputPath };
    },
  };
}
