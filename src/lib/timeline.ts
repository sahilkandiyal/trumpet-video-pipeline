export const INTRO_SECONDS = 2.5;
export const QUESTION_LEAD_IN_SECONDS = 0.5;
export const QUESTION_TAIL_SECONDS = 0.7;

export type TurnTimeline = {
  questionStart: number;
  questionFrames: number;
  answerStart: number;
  answerFrames: number;
};

export type Timeline = {
  introFrames: number;
  /** Frames the spoken line waits after its section starts. */
  audioDelay: number;
  turns: TurnTimeline[];
  signOffStart: number;
  signOffFrames: number;
  totalFrames: number;
};

const toFrames = (seconds: number, fps: number) => Math.round(seconds * fps);

/** Deterministic: same durations in, same frame ranges out. */
export function buildTimeline(args: {
  turns: { questionSeconds: number; answerSeconds: number }[];
  signOffSeconds: number;
  fps: number;
  showIntro: boolean;
}): Timeline {
  const { fps } = args;
  const introFrames = args.showIntro ? toFrames(INTRO_SECONDS, fps) : 0;
  const audioDelay = toFrames(QUESTION_LEAD_IN_SECONDS, fps);
  const spokenFrames = (seconds: number) =>
    audioDelay + toFrames(seconds, fps) + toFrames(QUESTION_TAIL_SECONDS, fps);

  let cursor = introFrames;
  const turns: TurnTimeline[] = args.turns.map((t) => {
    const questionFrames = spokenFrames(t.questionSeconds);
    const answerFrames = Math.max(1, toFrames(t.answerSeconds, fps));
    const turn = {
      questionStart: cursor,
      questionFrames,
      answerStart: cursor + questionFrames,
      answerFrames,
    };
    cursor += questionFrames + answerFrames;
    return turn;
  });

  const signOffFrames = spokenFrames(args.signOffSeconds);
  return {
    introFrames,
    audioDelay,
    turns,
    signOffStart: cursor,
    signOffFrames,
    totalFrames: cursor + signOffFrames,
  };
}

export type CaptionChunk = { text: string; from: number; durationInFrames: number };

/**
 * Section-level captions: split the transcript into sentence-sized chunks and
 * share the section's frames in proportion to chunk length. No word timestamps.
 */
export function buildCaptions(
  transcript: string,
  totalFrames: number,
): CaptionChunk[] {
  const sentences = transcript
    .replace(/\s+/g, " ")
    .trim()
    .match(/[^.!?]+[.!?]*/g)
    ?.map((s) => s.trim())
    .filter(Boolean);
  if (!sentences || sentences.length === 0 || totalFrames <= 0) return [];

  // Break very long sentences at commas/word boundaries (~90 chars max).
  const pieces: string[] = [];
  for (const sentence of sentences) {
    let rest = sentence;
    while (rest.length > 90) {
      const cut = rest.lastIndexOf(" ", 90);
      const at = cut > 40 ? cut : 90;
      pieces.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest) pieces.push(rest);
  }

  const totalChars = pieces.reduce((n, p) => n + p.length, 0);
  const chunks: CaptionChunk[] = [];
  let used = 0;
  pieces.forEach((text, i) => {
    const isLast = i === pieces.length - 1;
    const frames = isLast
      ? totalFrames - used
      : Math.max(1, Math.round((text.length / totalChars) * totalFrames));
    chunks.push({ text, from: used, durationInFrames: frames });
    used += frames;
  });
  return chunks;
}
