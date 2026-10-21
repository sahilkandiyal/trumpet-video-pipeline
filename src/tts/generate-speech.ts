import { createLocalProvider } from "./providers/local-provider";
import type { TtsProvider, TtsRequest, TtsResult } from "./types";

export function getProvider(name = process.env.TTS_PROVIDER ?? "local"): TtsProvider {
  switch (name) {
    case "local":
      return createLocalProvider();
    default:
      throw new Error(`Unknown TTS provider "${name}". Available: local`);
  }
}

export async function generateSpeech(request: TtsRequest): Promise<TtsResult & { seconds: number }> {
  const provider = getProvider();
  const started = Date.now();
  const result = await provider.generateSpeech(request);
  return { ...result, seconds: (Date.now() - started) / 1000 };
}
