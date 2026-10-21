import { validateInput } from "../src/lib/media-validation";

const inputFile = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "input/sample-interview.json";
const stage = process.argv.includes("--voice") ? "voice" : "render";

const { errors, warnings } = validateInput(inputFile, stage);
warnings.forEach((w) => console.warn(`warning: ${w}`));

if (errors.length > 0) {
  console.error(`Validation failed for ${inputFile}:`);
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}
console.log(`OK: ${inputFile} is valid (${stage} stage)`);
