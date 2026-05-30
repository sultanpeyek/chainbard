import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { COLORS } from "../brand";
import { FONT_DISPLAY } from "../fonts";

// BRAND INTRO 0–60f (2s): the chainbard cold-open. The lockup (PlumeMark cap +
// chain/bard wordmark + brand line) is fully present on frame 0 — first frame
// reads as ChainBard — then settles and fades out to hand off to the page flow.
// Same lockup order/styling as the end card; this is its bookend at the top.
export const BrandIntro: React.FC = () => {
  const frame = useCurrentFrame();
  // Subtle cap settle (no opacity fade-in — present on f0 by design).
  const settle = interpolate(frame, [0, 18], [0.97, 1], {
    extrapolateRight: "clamp",
  });
  // Hold, then fade out f48→60 to ink (Source cuts in on the same ground).
  const out = interpolate(frame, [48, 60], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.ink,
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        gap: 30,
        opacity: out,
      }}
    >
      {/* PlumeMark cap — never recolored, kept on ink ground */}
      <Img
        src={staticFile("logo-cap-1024.png")}
        style={{
          width: 380,
          height: 220,
          objectFit: "contain",
          transform: `scale(${settle})`,
        }}
      />
      {/* Wordmark: "chain" bone, "bard" amber, Fraunces display */}
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 92,
          fontWeight: 600,
        }}
      >
        <span style={{ color: COLORS.bone }}>chain</span>
        <span style={{ color: COLORS.amber }}>bard</span>
      </div>
      {/* Brand line */}
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontStyle: "italic",
          fontSize: 32,
          color: COLORS.boneDim,
        }}
      >
        Every address holds a story.
      </div>
    </AbsoluteFill>
  );
};
