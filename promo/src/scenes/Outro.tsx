import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { COLORS } from "../brand";
import { FONT_DISPLAY, FONT_MONO } from "../fonts";
import { useEnter } from "../helpers";

// Two outro variants — kicker "Autonomous. Paid on-chain via x402." → end card
// (PlumeMark cap + chain/bard wordmark + brand line). OutroRecut is the compact
// 105f close; OutroFull is the 120f close that also carries the /activity CTA.

// ── RECUT OUTRO ── compact 105f variant (950–1055 in the ~35s recut). Kicker →
// end card, timed to fully settle inside 3.5s. Motion via interpolate/useEnter
// only.
const KickerCompact: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12, 28, 40], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const rise = interpolate(frame, [0, 12], [10, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          opacity,
          transform: `translateY(${rise}px)`,
          fontFamily: FONT_MONO,
          fontSize: 30,
          color: COLORS.boneDim,
          letterSpacing: 0.5,
        }}
      >
        Autonomous. Paid on-chain via{" "}
        <span style={{ color: COLORS.amber }}>x402.</span>
      </div>
    </AbsoluteFill>
  );
};

const EndCardCompact: React.FC = () => {
  // Tighter delays than EndCard so cap/word/line all settle by ~f96 in a 75f
  // window (this card mounts at local f30 of the 105f OutroRecut).
  const mark = useEnter(2, 22);
  const word = useEnter(12, 22);
  const line = useEnter(24, 22);
  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.ink,
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        gap: 30,
      }}
    >
      <Img
        src={staticFile("logo-cap-1024.png")}
        style={{
          width: 380,
          height: 220,
          objectFit: "contain",
          opacity: mark,
          transform: `translateY(${interpolate(mark, [0, 1], [18, 0])}px) scale(${interpolate(mark, [0, 1], [0.96, 1])})`,
        }}
      />
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 92,
          fontWeight: 600,
          opacity: word,
          transform: `translateY(${interpolate(word, [0, 1], [14, 0])}px)`,
        }}
      >
        <span style={{ color: COLORS.bone }}>chain</span>
        <span style={{ color: COLORS.amber }}>bard</span>
      </div>
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontStyle: "italic",
          fontSize: 32,
          color: COLORS.boneDim,
          opacity: line,
          transform: `translateY(${interpolate(line, [0, 1], [12, 0])}px)`,
        }}
      >
        Every address holds a story.
      </div>
    </AbsoluteFill>
  );
};

export const OutroRecut: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.ink }}>
      {/* Kicker holds ~0–40f; end card carries f30–105 (brand-correct crossfade). */}
      <Sequence durationInFrames={42}>
        <KickerCompact />
      </Sequence>
      <Sequence from={30}>
        <EndCardCompact />
      </Sequence>
    </AbsoluteFill>
  );
};

// ── FULL OUTRO ── 120f variant (1535–1655 in the ~55s full cut). Same kicker →
// end card beats as OutroRecut, but the end card carries the explicit /activity
// CTA url (the full cut's whole closing ask: go watch it run live). interpolate-only.
const KickerFull: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 14, 38, 52], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const rise = interpolate(frame, [0, 14], [10, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          opacity,
          transform: `translateY(${rise}px)`,
          fontFamily: FONT_MONO,
          fontSize: 30,
          color: COLORS.boneDim,
          letterSpacing: 0.5,
        }}
      >
        Autonomous. Paid on-chain via{" "}
        <span style={{ color: COLORS.amber }}>x402.</span>
      </div>
    </AbsoluteFill>
  );
};

const EndCardFull: React.FC = () => {
  // Mounts at local f42 of the 120f OutroFull → 78f window. Tighter than the 30s
  // EndCard so cap/word/line + the CTA url all settle and breathe.
  const mark = useEnter(2, 22);
  const word = useEnter(12, 22);
  const line = useEnter(24, 22);
  const cta = useEnter(38, 24);
  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.ink,
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        gap: 30,
      }}
    >
      <Img
        src={staticFile("logo-cap-1024.png")}
        style={{
          width: 380,
          height: 220,
          objectFit: "contain",
          opacity: mark,
          transform: `translateY(${interpolate(mark, [0, 1], [18, 0])}px) scale(${interpolate(mark, [0, 1], [0.96, 1])})`,
        }}
      />
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 92,
          fontWeight: 600,
          opacity: word,
          transform: `translateY(${interpolate(word, [0, 1], [14, 0])}px)`,
        }}
      >
        <span style={{ color: COLORS.bone }}>chain</span>
        <span style={{ color: COLORS.amber }}>bard</span>
      </div>
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontStyle: "italic",
          fontSize: 32,
          color: COLORS.boneDim,
          opacity: line,
          transform: `translateY(${interpolate(line, [0, 1], [12, 0])}px)`,
        }}
      >
        Every address holds a story.
      </div>
      {/* Closing CTA — drive the viewer to the live autonomous proof surface. */}
      <div
        style={{
          marginTop: 8,
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontFamily: FONT_MONO,
          fontSize: 24,
          letterSpacing: "0.04em",
          opacity: cta,
          transform: `translateY(${interpolate(cta, [0, 1], [10, 0])}px)`,
        }}
      >
        <span style={{ color: COLORS.boneDim }}>Watch it run:</span>
        <span style={{ color: COLORS.amber }}>/activity</span>
        <span aria-hidden style={{ color: COLORS.amber }}>
          ↗
        </span>
      </div>
    </AbsoluteFill>
  );
};

export const OutroFull: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.ink }}>
      {/* Kicker holds ~0–52f; end card carries f42–120 (brand-correct crossfade). */}
      <Sequence durationInFrames={54}>
        <KickerFull />
      </Sequence>
      <Sequence from={42}>
        <EndCardFull />
      </Sequence>
    </AbsoluteFill>
  );
};
