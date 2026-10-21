import React from "react";
import { AbsoluteFill, Html5Audio, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";

const BARS = 32;

/** Voice-only answers get their own complete layout (PRD: voice parity). */
export const AudioAnswer: React.FC<{
  audioStaticPath: string;
  founderName: string;
  productName: string;
}> = ({ audioStaticPath, founderName, productName }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const src = staticFile(audioStaticPath);
  const audioData = useAudioData(src);
  const levels = audioData
    ? visualizeAudio({ audioData, frame, fps, numberOfSamples: 64 }).slice(0, BARS)
    : new Array(BARS).fill(0);

  return (
    <AbsoluteFill
      style={{
        background: "#0f0f0f",
        justifyContent: "center",
        alignItems: "center",
        color: "#fff",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, height: 300 }}>
        {levels.map((v, i) => (
          <div
            key={i}
            style={{
              width: 22,
              height: 14 + Math.min(1, Math.sqrt(v) * 1.8) * 280,
              borderRadius: 11,
              background: "#ff5a1f",
            }}
          />
        ))}
      </div>
      <div style={{ marginTop: 50, fontSize: 52, fontWeight: 700 }}>{founderName}</div>
      <div style={{ marginTop: 10, fontSize: 30, opacity: 0.6 }}>{productName} · voice answer</div>
      <Html5Audio src={src} />
    </AbsoluteFill>
  );
};
