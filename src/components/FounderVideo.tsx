import React from "react";
import { AbsoluteFill, OffthreadVideo, staticFile } from "remotion";

/** Founder footage is the dominant visual; its own audio track is played as-is. */
export const FounderVideo: React.FC<{ videoStaticPath: string }> = ({ videoStaticPath }) => (
  <AbsoluteFill style={{ background: "#000" }}>
    <OffthreadVideo src={staticFile(videoStaticPath)} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
  </AbsoluteFill>
);
