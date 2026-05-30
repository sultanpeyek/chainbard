import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { COLORS, ENTER_BEZIER, FADE_BEZIER } from "../brand";
import { FONT_DISPLAY, FONT_MONO } from "../fonts";
import { useEnter } from "../helpers";

// MINT 270–540f (9s, local 0–270): inline recreation of the streaming
// MintConsole (src/components/mint-console.tsx + src/hooks/use-mint.ts). A mint
// card hands off to the console, which streams the real briefless mint path —
// 12 steps, one per NDJSON event — each row appearing ACTIVE (amber spinner)
// then settling to DONE (✓), with a Solscan ↗ on the three signature-carrying
// settlement steps. The engine of the video; paced across the full 270 frames.
//
// FIDELITY (verified against the real source):
//   - Briefless path omits the 'direct' step ('Read the brief') → EXACTLY 12.
//   - Active glyph is a spinner; the real product uses CSS `animate-spin`, which
//     Remotion will NOT render frame-by-frame → here it rotates via
//     transform: rotate(interpolate(...)). (HARD INVARIANT: interpolate-only.)
//   - The console box keeps minHeight:318 from mount so rows fill DOWN into a
//     reserved 12-row box — no upward recenter creep as they stream in.
//   - The mint header stays MOUNTED at opacity 0 after the handoff (never
//     conditionally unmounted), so the console's Y never jumps.

// The 12 briefless steps, in the real emit order (StepId → STEP_LABELS).
// `sig` marks the two steps that carry an on-chain signature (Solscan ↗): the
// real stream emits a sig on `settle` + `memo` only — `confirm` merely
// re-confirms the already-settled tx and produces no new signature.
const STEPS: { label: string; sig?: boolean }[] = [
  { label: "Build USDC payment" },
  { label: "Dry-run the transfer" },
  { label: "Approve in wallet" },
  { label: "Verify payment" },
  { label: "Settle on-chain", sig: true },
  { label: "Confirm on-chain" },
  { label: "Gather on-chain facts" },
  { label: "Search the web" },
  { label: "Write your story" },
  { label: "Generate image" },
  { label: "Save" },
  { label: "Stamp receipt on-chain", sig: true },
];

// Streaming cadence (local frames). Console opens ~OPEN; rows start one at a
// time STEP_DUR apart; the last row settles by LAST_DONE, leaving a tail for the
// PAYOFF bridge.
const OPEN = 46;
const FIRST = OPEN + 6; // 52
const STEP_DUR = 16;
const startOf = (i: number) => FIRST + i * STEP_DUR; // row i mounts (active)
const LAST_DONE = startOf(STEPS.length - 1) + 16; // 12th row done by ~244

// The active-row spinner: a ring with a transparent top, rotated by frame.
const Spinner: React.FC<{ frame: number }> = ({ frame }) => (
  <span
    aria-hidden
    style={{
      width: 14,
      height: 14,
      borderRadius: 999,
      border: `2px solid ${COLORS.amber}`,
      borderTopColor: "transparent",
      display: "inline-block",
      transform: `rotate(${(frame * 16) % 360}deg)`,
    }}
  />
);

// One streamed step row: pending rows are not yet emitted (not rendered); a row
// appears ACTIVE (spinner, bone) then flips to DONE (✓, bone-dim). Settlement
// rows gain a Solscan ↗ on completion.
const StepRow: React.FC<{
  frame: number;
  index: number;
  label: string;
  sig?: boolean;
}> = ({ frame, index, label, sig }) => {
  const start = startOf(index);
  if (frame < start) return null;

  const next = index < STEPS.length - 1 ? startOf(index + 1) : LAST_DONE;
  const done = frame >= next;

  const enter = interpolate(frame, [start, start + 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...ENTER_BEZIER),
  });

  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontFamily: FONT_MONO,
        letterSpacing: "-0.01em",
        fontSize: done ? 17 : 19,
        color: done ? COLORS.boneDim : COLORS.bone,
        opacity: enter,
        transform: `translateX(${interpolate(enter, [0, 1], [-6, 0])}px)`,
      }}
    >
      {/* fixed-width glyph slot (mirrors the real w-4 justify-center span) */}
      <span
        style={{
          width: 20,
          display: "inline-flex",
          justifyContent: "center",
          flexShrink: 0,
          color: done ? COLORS.boneDim : COLORS.amber,
        }}
      >
        {done ? "✓" : <Spinner frame={frame} />}
      </span>
      <span>{label}</span>
      {sig && done && (
        <span aria-hidden style={{ color: COLORS.amber, fontSize: 16 }}>
          ↗
        </span>
      )}
    </li>
  );
};

export const Mint: React.FC = () => {
  const frame = useCurrentFrame();

  // Column scale 1.30 → 1.45 across the handoff band (anchor from prior cut),
  // settling on the brand curve; origin center so it grows in place.
  const colScale = interpolate(frame, [24, 44], [1.3, 1.45], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...ENTER_BEZIER),
  });

  // Header → console handoff: the intro CTA fades out but stays MOUNTED (its box
  // height is reserved), so the console below never jumps. handoff>0.01 ⇒ the
  // header rides at opacity ~0 yet remains in the layout.
  const handoff = interpolate(frame, [30, 46], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...FADE_BEZIER),
  });
  const headerOpacity = useEnter(8, 16) * (1 - handoff);

  // Console fades/scales in as the header hands off.
  const consoleIn = interpolate(frame, [34, 52], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...ENTER_BEZIER),
  });

  // PAYOFF bridge: footer hairline note settles in over the tail.
  const bridge = interpolate(frame, [250, 268], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...ENTER_BEZIER),
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.ink,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: 1080,
          transform: `scale(${colScale})`,
          transformOrigin: "center center",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* eyebrow + price (persistent scene framing) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            opacity: useEnter(0, 18),
          }}
        >
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontFamily: FONT_MONO,
              fontSize: 18,
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.3em",
              color: COLORS.amber,
            }}
          >
            <span aria-hidden>✦</span>
            Minting on-chain
          </span>
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 16,
              textTransform: "uppercase",
              letterSpacing: "0.18em",
              color: COLORS.boneDim,
            }}
          >
            USDC · mainnet
          </span>
        </div>

        {/* subject title (persistent) */}
        <div
          style={{
            marginTop: 14,
            fontFamily: FONT_DISPLAY,
            fontWeight: 500,
            fontSize: 36,
            color: COLORS.bone,
            opacity: useEnter(4, 22),
          }}
        >
          BONK - The Meme That Saved Solana
        </div>

        {/* HEADER (hands off): reserved-height intro line. Stays mounted at
            opacity ~0 once handoff>0.01 so the console below never shifts. */}
        <div style={{ height: 46, display: "flex", alignItems: "center" }}>
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 18,
              color: COLORS.boneDim,
              opacity: headerOpacity,
            }}
          >
            Approve USDC payment — settling on mainnet…
          </span>
        </div>

        {/* THE CONSOLE — FIXED height reserves the full 12-row box from mount so
            the column never grows as rows stream in (kills the recenter creep;
            the real app's 318 fits 12 tiny rows, but these are cinema-scale).
            Mirrors MintConsole: ink-line border, ink-raised bg, rounded 3. */}
        <div
          style={{
            height: 480,
            borderRadius: 3,
            border: `1px solid ${COLORS.inkLine}`,
            backgroundColor: "rgba(21,18,15,0.60)" /* ink-raised/60 */,
            padding: 24,
            opacity: consoleIn,
            transform: `translateY(${interpolate(consoleIn, [0, 1], [10, 0])}px)`,
          }}
        >
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {STEPS.map((step, i) => (
              <StepRow
                key={step.label}
                frame={frame}
                index={i}
                label={step.label}
                sig={step.sig}
              />
            ))}
          </ul>
        </div>

        {/* PAYOFF bridge — reserved-height footer note settles in over the tail. */}
        <div style={{ height: 40, display: "flex", alignItems: "center" }}>
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 15,
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              color: COLORS.boneDim,
              opacity: bridge,
            }}
          >
            receipt sealed · verifiable on-chain
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
