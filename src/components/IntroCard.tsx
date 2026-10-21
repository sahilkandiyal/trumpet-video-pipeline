import React from "react";
import { AbsoluteFill } from "remotion";

export const IntroCard: React.FC<{ title: string; founderName: string; productName: string }> = ({
  title,
  founderName,
  productName,
}) => (
  <AbsoluteFill
    style={{
      background: "linear-gradient(135deg, #1f2a44, #3b2f63)",
      justifyContent: "center",
      alignItems: "center",
      color: "#fff",
      fontFamily: "Arial, Helvetica, sans-serif",
      textAlign: "center",
    }}
  >
    <div style={{ fontSize: 78, fontWeight: 700 }}>{title}</div>
    <div style={{ fontSize: 40, marginTop: 28, opacity: 0.85 }}>
      {founderName} · {productName}
    </div>
  </AbsoluteFill>
);
