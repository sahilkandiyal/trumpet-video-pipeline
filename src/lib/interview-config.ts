/**
 * Interview rails from the PRD (section 5). The questions are fixed for now:
 * this is the single place a dynamic (LLM) question generator would replace later.
 */
export const MAX_TURNS = 3;

export const INTERVIEW_CONFIG = {
  /** Q1 is always "Why did you build this?". Q2/Q3 come from the goal sheet (struggle, future goals). */
  questions: [
    "Why did you build this?",
    "What was the hardest moment, or the thing that went most wrong, along the way?",
    "Where do you want to take this next? What's your big goal for the future?",
  ],
  /** Placeholder until the brand catchphrase is written. */
  signOff: "That's all from me. Thank you for sharing your story with Trumpet!",
  maxAnswerSeconds: 90,
  /** PRD says 15s; kept low so testers can try the flow quickly. */
  minAnswerSeconds: 5,
  /** First take plus two re-records. */
  maxTakes: 3,
} as const;
