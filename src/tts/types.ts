export type TtsRequest = {
  text: string;
  /** Absolute path the provider must write the audio file to. */
  outputPath: string;
};

export type TtsResult = { audioPath: string };

export type TtsProvider = {
  name: string;
  generateSpeech(request: TtsRequest): Promise<TtsResult>;
};
