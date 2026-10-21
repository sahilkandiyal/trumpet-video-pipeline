import React from "react";
import { Composition, staticFile } from "remotion";
import { getAudioDurationInSeconds, getVideoMetadata } from "@remotion/media-utils";
import { InterviewVideo } from "./compositions/InterviewVideo";
import { VIDEO_CONFIG, type InterviewVideoProps } from "./lib/interview-schema";
import { buildTimeline } from "./lib/timeline";
import sampleInterview from "../input/sample-interview.json";

const stripPublic = (p: string) => p.replace(/\\/g, "/").replace(/^public\//, "");
const mediaUrl = (p: string) => staticFile(stripPublic(p));

// Studio previews the same input file that `pnpm render` uses.
const defaultProps = sampleInterview as InterviewVideoProps;

export const Root: React.FC = () => (
  <Composition
    id="InterviewVideo"
    component={InterviewVideo}
    width={VIDEO_CONFIG.width}
    height={VIDEO_CONFIG.height}
    fps={VIDEO_CONFIG.fps}
    durationInFrames={VIDEO_CONFIG.fps * 10}
    defaultProps={defaultProps}
    // Total length comes from the real media, never from hard-coded numbers.
    calculateMetadata={async ({ props }) => {
      const turns = await Promise.all(
        props.turns.map(async (turn) => {
          const [questionSeconds, answerSeconds] = await Promise.all([
            getAudioDurationInSeconds(mediaUrl(turn.question.audioPath)),
            turn.answer.kind === "video"
              ? getVideoMetadata(mediaUrl(turn.answer.mediaPath)).then((m) => m.durationInSeconds)
              : getAudioDurationInSeconds(mediaUrl(turn.answer.mediaPath)),
          ]);
          return { questionSeconds, answerSeconds };
        }),
      );
      const signOffSeconds = await getAudioDurationInSeconds(mediaUrl(props.signOff.audioPath));

      const timeline = buildTimeline({
        turns,
        signOffSeconds,
        fps: VIDEO_CONFIG.fps,
        showIntro: props.branding.showIntro,
      });
      return {
        durationInFrames: timeline.totalFrames,
        props: { ...props, durations: { turns, signOffSeconds } },
      };
    }}
  />
);
