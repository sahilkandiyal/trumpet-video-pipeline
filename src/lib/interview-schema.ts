import { z } from "zod";
import { MAX_TURNS } from "./interview-config";

/**
 * Prototype input contract. Paths are relative to the project root and must
 * live under `public/` so Remotion can serve them via staticFile().
 */
const spokenLineSchema = z.object({
  text: z.string().trim().min(1, "Text must not be empty"),
  audioPath: z.string().min(1),
});

export const turnSchema = z.object({
  question: spokenLineSchema,
  answer: z.object({
    /** "video" = founder on camera, "audio" = voice-only answer. */
    kind: z.enum(["video", "audio"]),
    mediaPath: z.string().min(1),
    transcript: z.string().optional(),
  }),
});

export const interviewInputSchema = z.object({
  title: z.string().min(1),
  founderName: z.string().min(1),
  productName: z.string().min(1),
  turns: z.array(turnSchema).min(1, "At least one question is required").max(MAX_TURNS),
  signOff: spokenLineSchema,
  branding: z.object({
    showCaptions: z.boolean().default(true),
    showIntro: z.boolean().default(true),
  }),
});

export type InterviewInput = z.infer<typeof interviewInputSchema>;
export type Turn = z.infer<typeof turnSchema>;

/** Durations measured from the real media files, filled in at render time. */
export type InterviewDurations = {
  turns: { questionSeconds: number; answerSeconds: number }[];
  signOffSeconds: number;
};

export type InterviewVideoProps = InterviewInput & { durations?: InterviewDurations };

export const VIDEO_CONFIG = {
  width: 1920,
  height: 1080,
  fps: 30,
} as const;
