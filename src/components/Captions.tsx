import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import type { CaptionChunk } from "../lib/timeline";

export const Captions: React.FC<{ chunks: CaptionChunk[] }> = ({ chunks }) => (
  <>
    {chunks.map((chunk, i) => (
      <Sequence key={i} from={chunk.from} durationInFrames={chunk.durationInFrames}>
        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 90 }}>
          <div
            style={{
              maxWidth: 1500,
              padding: "16px 32px",
              borderRadius: 14,
              background: "rgba(0, 0, 0, 0.72)",
              color: "#fff",
              fontFamily: "Arial, Helvetica, sans-serif",
              fontSize: 46,
              lineHeight: 1.25,
              fontWeight: 600,
              textAlign: "center",
            }}
          >
            {chunk.text}
          </div>
        </AbsoluteFill>
      </Sequence>
    ))}
  </>
);
