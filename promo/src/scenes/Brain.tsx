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

// BRAIN (9s, local 0–270): the autonomous DAILY CURATOR TICK rendered as a
// streaming console — a sibling of Mint.tsx's MintConsole, but AGENT-FUNDED.
// This is the engine of the autonomous act: the agent discovers SAP tools,
// scans on-chain signals, DECIDES its own subject mid-stream, enriches it,
// pays a third-party Sentinel service from its OWN treasury via sap-x402
// escrow (NO self-dealing — provenance 'curator', a curator pick), writes +
// renders the story, publishes the page, stamps a SAP Memo v2 audit entry,
// and pings the operator webhook.
//
// FIDELITY (matches Mint's idioms exactly so it reads as the same console):
//   - Active glyph is a Spinner that rotates via transform: rotate(interpolate)
//     — NEVER animate-spin (HARD INVARIANT: interpolate-only).
//   - StepRow appears ACTIVE (amber spinner, bone) then settles to DONE (✓,
//     bone-dim, smaller). sig:true rows carry an on-chain signature → amber ↗.
//   - The console box reserves its FULL 11-row height from mount so the column
//     never grows / recenters as rows stream in.
//   - colScale 1.30 → 1.45 across the open band, transformOrigin center, same
//     as Mint, so it belongs to the same console family.
//
// PROVENANCE HONESTY: the autonomous tick is provenance 'curator' (a curator
// pick), agent-funded from its own treasury, consuming only third-party Ace
// Data services. Any on-chain signature shown is TRUNCATED + ILLUSTRATIVE only
// (promo, no live chain call) — Payoff.tsx's "8…6" tx convention.

// The 11 streamed brain steps, in emit order. `sig` marks the two steps that
// carry an on-chain signature (amber ↗): the sap-x402 escrow payment to the
// third-party Sentinel service, and the SAP Memo v2 audit stamp.
const STEPS: { label: string; sig?: boolean }[] = [
  { label: "Discover SAP tools · getProgramAccounts" },
  { label: "Ace SERP · scan today's on-chain signals" },
  { label: "Ace Chat · decide { kind, identifier }" }, // subject resolves here
  { label: "Ace SERP · enrich the subject" },
  { label: "Synapse RPC · balances, assets, history" },
  { label: "Sentinel das_getAsset · paid via sap-x402 escrow", sig: true },
  { label: "Ace Chat · write the story" },
  { label: "Ace Image · render hero (nano-banana → seedream)" },
  { label: "Save · publish the story page" },
  { label: "SAP Memo v2 · stamp audit entry", sig: true },
  { label: "POST · operator webhook (story URL)" },
];

// The agent decides its own subject mid-stream — the autonomy beat. When the
// "decide" row (index 2) completes, the subject line flips from "deciding…" to
// the resolved subject. These strings are IDENTICAL to Activity's newest row.
const DECIDE_INDEX = 2;

// Streaming cadence (local frames). Console opens ~OPEN; rows start one at a
// time STEP_DUR apart; the last (11th) row settles by LAST_DONE ≈ 239, leaving
// a ~30f tail for the footer bridge. (Mint used OPEN=46/FIRST=52/STEP_DUR=16
// for 12 rows; 11 rows at STEP_DUR=17 lands the last done before ~248.)
const OPEN = 46;
const FIRST = OPEN + 6; // 52
const STEP_DUR = 17;
const startOf = (i: number) => FIRST + i * STEP_DUR; // row i mounts (active)
const LAST_DONE = startOf(STEPS.length - 1) + 17; // 11th row done by ~239

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
// appears ACTIVE (spinner, bone) then flips to DONE (✓, bone-dim). The two
// signature-carrying steps gain an amber ↗ on completion.
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
      {/* fixed-width glyph slot (mirrors Mint's w-4 justify-center span) */}
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

export const Brain: React.FC = () => {
  const frame = useCurrentFrame();

  // Column scale 1.30 → 1.45 across the open band (matches Mint), origin center
  // so it grows in place and reads as the same console family.
  const colScale = interpolate(frame, [24, 44], [1.3, 1.45], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...ENTER_BEZIER),
  });

  // Console fades / scales in as the header settles.
  const consoleIn = interpolate(frame, [34, 52], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...ENTER_BEZIER),
  });

  // THE AUTONOMY BEAT — the agent decides its own subject mid-stream. The
  // subject line flips when the "decide" row completes (when the NEXT row
  // mounts), crossfading "deciding…" out and the resolved subject in.
  const subjectResolveAt = startOf(DECIDE_INDEX + 1); // ≈ f103
  const subjectFlip = interpolate(
    frame,
    [subjectResolveAt - 8, subjectResolveAt + 8],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(...FADE_BEZIER),
    },
  );

  // FOOTER BRIDGE: hairline note settles in over the tail.
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
        {/* HEADER — eyebrow (left) + agent-funded meta (right) */}
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
            Autonomous curator tick
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
            agent-funded · treasury
          </span>
        </div>

        {/* SUBJECT LINE — the agent DECIDES its own subject mid-stream. Before
            the decide row completes: bone-dim italic "deciding…". After: a small
            wallet kind dot + the resolved subject. Crossfaded (the autonomy
            beat). Reserved height so the console below never shifts. */}
        <div
          style={{
            position: "relative",
            marginTop: 14,
            height: 48,
            display: "flex",
            alignItems: "center",
          }}
        >
          {/* deciding… (fades out as the decision resolves) */}
          <span
            style={{
              position: "absolute",
              left: 0,
              fontFamily: FONT_DISPLAY,
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: 36,
              color: COLORS.boneDim,
              opacity: 1 - subjectFlip,
            }}
          >
            deciding the day's subject…
          </span>
          {/* resolved subject (fades in) — wallet kind dot + title */}
          <span
            style={{
              position: "absolute",
              left: 0,
              display: "flex",
              alignItems: "center",
              gap: 14,
              opacity: subjectFlip,
            }}
          >
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: 999,
                backgroundColor: COLORS.wallet,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 500,
                fontSize: 36,
                color: COLORS.bone,
              }}
            >
              A whale wakes after 400 days
            </span>
          </span>
        </div>

        {/* THE CONSOLE — FIXED height reserves the full 11-row box from mount so
            the column never grows as rows stream in (kills recenter creep).
            Mirrors MintConsole: ink-line border, ink-raised bg, rounded 3. */}
        <div
          style={{
            marginTop: 14,
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

        {/* FOOTER BRIDGE — reserved-height hairline note settles in over the tail. */}
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
            published autonomously · paid from treasury · audited on-chain
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
