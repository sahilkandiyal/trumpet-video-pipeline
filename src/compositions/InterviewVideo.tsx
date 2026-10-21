import React from "react";
import { AbsoluteFill, interpolate, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { AudioAnswer } from "../components/AudioAnswer";
import { Captions } from "../components/Captions";
import { ElephantInterviewer } from "../components/ElephantInterviewer";
import { FounderVideo } from "../components/FounderVideo";
import { IntroCard } from "../components/IntroCard";
import type { InterviewVideoProps } from "../lib/interview-schema";
import { buildCaptions, buildTimeline } from "../lib/timeline";

const FADE_FRAMES = 8;

/** Fade a section in and out so cuts between sections feel deliberate. */
const Fade: React.FC<{ durationInFrames: number; children: React.ReactNode }> = ({
  durationInFrames,
  children,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [0, FADE_FRAMES, durationInFrames - FADE_FRAMES, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

/** "public/media/x.mp4" -> "media/x.mp4" */
const stripPublic = (p: string) => p.replace(/\\/g, "/").replace(/^public\//, "");

export const InterviewVideo: React.FC<InterviewVideoProps> = (props) => {
  const { fps } = useVideoConfig();
  const { title, founderName, productName, turns, signOff, branding, durations } = props;

  const t = buildTimeline({
    turns: durations?.turns ?? turns.map(() => ({ questionSeconds: 3, answerSeconds: 5 })),
    signOffSeconds: durations?.signOffSeconds ?? 3,
    fps,
    showIntro: branding.showIntro,
  });

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {t.introFrames > 0 && (
        <Sequence from={0} durationInFrames={t.introFrames}>
          <Fade durationInFrames={t.introFrames}>
            <IntroCard title={title} founderName={founderName} productName={productName} />
          </Fade>
        </Sequence>
      )}

      {turns.map((turn, i) => {
        const tl = t.turns[i];
        const captions =
          branding.showCaptions && turn.answer.transcript
            ? buildCaptions(turn.answer.transcript, tl.answerFrames)
            : [];
        const mediaPath = stripPublic(turn.answer.mediaPath);
        return (
          <React.Fragment key={i}>
            <Sequence from={tl.questionStart} durationInFrames={tl.questionFrames}>
              <Fade durationInFrames={tl.questionFrames}>
                <ElephantInterviewer
                  questionText={turn.question.text}
                  audioStaticPath={stripPublic(turn.question.audioPath)}
                  audioDelayFrames={t.audioDelay}
                  speakingFrames={Math.round((durations?.turns[i].questionSeconds ?? 3) * fps)}
                />
              </Fade>
            </Sequence>

            <Sequence from={tl.answerStart} durationInFrames={tl.answerFrames}>
              {turn.answer.kind === "video" ? (
                <FounderVideo videoStaticPath={mediaPath} />
              ) : (
                <AudioAnswer audioStaticPath={mediaPath} founderName={founderName} productName={productName} />
              )}
              <Captions chunks={captions} />
            </Sequence>
          </React.Fragment>
        );
      })}

      <Sequence from={t.signOffStart} durationInFrames={t.signOffFrames}>
        <Fade durationInFrames={t.signOffFrames}>
          <ElephantInterviewer
            questionText={signOff.text}
            audioStaticPath={stripPublic(signOff.audioPath)}
            audioDelayFrames={t.audioDelay}
            speakingFrames={Math.round((durations?.signOffSeconds ?? 3) * fps)}
            label="Trumpet signs off"
          />
        </Fade>
      </Sequence>
    </AbsoluteFill>
  );
};
