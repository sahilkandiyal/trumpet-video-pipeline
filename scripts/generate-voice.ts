import path from "node:path";
import { loadEnvLocal } from "../src/lib/env";
import { PROJECT_ROOT, resolvePublicPath, validateInput } from "../src/lib/media-validation";
import { generateSpeech } from "../src/tts/generate-speech";

loadEnvLocal();

async function main() {
  const inputFile = process.argv[2] ?? "input/sample-interview.json";
  const { errors, input } = validateInput(inputFile, "voice");
  if (errors.length > 0 || !input) {
    console.error(`Validation failed for ${inputFile}:`);
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  const lines = [...input.turns.map((t) => t.question), input.signOff];
  for (const line of lines) {
    const outputPath = resolvePublicPath(line.audioPath);
    console.log(`Generating speech for: "${line.text}"`);
    const result = await generateSpeech({ text: line.text, outputPath });
    console.log(`Wrote ${path.relative(PROJECT_ROOT, result.audioPath)} in ${result.seconds.toFixed(1)}s`);
  }
}

main().catch((e) => {
  console.error(`Voice generation failed: ${(e as Error).message}`);
  process.exit(1);
});
