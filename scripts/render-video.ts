import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT, validateInput } from "../src/lib/media-validation";

const inputFile = process.argv[2] ?? "input/sample-interview.json";
const outFile = process.argv[3] ?? "output/interview-demo.mp4";

const { errors } = validateInput(inputFile, "render");
if (errors.length > 0) {
  console.error(`Validation failed for ${inputFile}:`);
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}

const outAbs = path.resolve(PROJECT_ROOT, outFile);
fs.mkdirSync(path.dirname(outAbs), { recursive: true });
fs.rmSync(outAbs, { force: true });

const started = Date.now();
const remotionBin = path.join(PROJECT_ROOT, "node_modules", "remotion", "remotion-cli.js");
const cli = fs.existsSync(path.join(PROJECT_ROOT, "node_modules", ".bin", "remotion"))
  ? { cmd: process.platform === "win32" ? "node_modules\\.bin\\remotion.CMD" : "node_modules/.bin/remotion", shell: process.platform === "win32" }
  : { cmd: remotionBin, shell: false };

const run = spawnSync(
  cli.cmd,
  // Longer media-loading timeout: three answers plus audio are slow to load on a busy machine.
  ["render", "src/index.ts", "InterviewVideo", outFile, `--props=${inputFile}`, "--timeout=120000"],
  { cwd: PROJECT_ROOT, stdio: "inherit", shell: cli.shell },
);

if (run.status !== 0 || !fs.existsSync(outAbs) || fs.statSync(outAbs).size === 0) {
  console.error("Render failed: no output file was produced.");
  process.exit(run.status || 1);
}
console.log(`Rendered ${outFile} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
