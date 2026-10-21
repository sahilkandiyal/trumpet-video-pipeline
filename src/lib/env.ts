import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT } from "./media-validation";

/** Minimal .env.local loader (no extra dependency). Existing env vars win. */
export function loadEnvLocal() {
  const envFile = path.join(PROJECT_ROOT, ".env.local");
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    if (line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
