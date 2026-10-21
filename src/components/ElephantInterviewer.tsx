import React from "react";
import { AbsoluteFill, Html5Audio, Img, Sequence, staticFile, useCurrentFrame } from "remotion";

type Props = {
  questionText: string;
  /** Path relative to public/, e.g. "audio/question-01.wav" */
  audioStaticPath: string;
  audioDelayFrames: number;
  /** How long the voice plays, so the elephant only moves while it speaks. */
  speakingFrames?: number;
  label?: string;
};

export const ElephantInterviewer: React.FC<Props> = ({
  questionText,
  audioStaticPath,
  audioDelayFrames,
  speakingFrames = 0,
  label = "Trumpet asks",
}) => {
  const frame = useCurrentFrame();
  const speaking = frame >= audioDelayFrames && frame < audioDelayFrames + speakingFrames;
  // Gentle talking motion while the voice plays; perfectly still otherwise.
  const t = frame - audioDelayFrames;
  const bob = speaking ? Math.sin(t / 3) * 8 : 0;
  const tilt = speaking ? Math.sin(t / 5) * 2 : 0;

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(135deg, #f4e9d8, #e3cfae)",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 70,
        padding: 110,
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <Img
        src={staticFile("media/elephant.svg")}
        style={{ width: 500, height: 500, flex: "none", transform: `translateY(${bob}px) rotate(${tilt}deg)` }}
      />
      <div style={{ position: "relative", maxWidth: 940 }}>
        <div style={{ fontSize: 28, letterSpacing: 4, textTransform: "uppercase", color: "#7a5c2e", marginBottom: 16 }}>
          {label}
        </div>
        <div
          style={{
            position: "relative",
            background: "#fff",
            borderRadius: 36,
            padding: "44px 52px",
            boxShadow: "0 12px 40px rgba(60, 40, 10, 0.18)",
            fontSize: 58,
            fontWeight: 700,
            lineHeight: 1.22,
            color: "#2b2118",
          }}
        >
          {/* bubble tail pointing back at the elephant */}
          <div
            style={{
              position: "absolute",
              left: -34,
              top: 70,
              width: 0,
              height: 0,
              borderTop: "26px solid transparent",
              borderBottom: "26px solid transparent",
              borderRight: "40px solid #fff",
            }}
          />
          {questionText}
        </div>
      </div>
      <Sequence from={audioDelayFrames}>
        <Html5Audio src={staticFile(audioStaticPath)} />
      </Sequence>
    </AbsoluteFill>
  );
};
