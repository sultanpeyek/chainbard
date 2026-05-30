import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { COLORS, ENTER_BEZIER } from "../brand";
import { FONT_DISPLAY, FONT_MONO } from "../fonts";
import { useEnter } from "../helpers";

// AUTOINTRO 105f (3.5s, local 0–105): the ACT-BREAK pivot from the buyer-funded
// reactive flow (just shown) to the agent-funded AUTONOMOUS flow. A buyer paid —
// but the product ALSO runs itself, daily, with no human and no buyer. The big
// Fraunces headline is the star; a supporting cron-trigger card settles in below
// and the cron fires (200 · tick started) with a one-shot amber glow.
//
//   ~f0–40 : headline "No human. No buyer." lands (fade + slight rise).
//   ~f16   : mono subline "The daily curator tick runs itself."
//   ~f40+  : ink-raised cron card settles in (vercel cron · 00:00 UTC + GET path).
//   ~f64   : status pill flips boneDim "waiting…" → verdant "200 · tick started"
//            with a ONE-SHOT amber glow pulse; chips read no human · no buyer ·
//            agent-funded. Hold to f105 (Sequence cut handles the exit).
//
// PROVENANCE HONESTY: the autonomous tick is provenance 'curator' (a curator
// pick, agent-funded from its OWN treasury, no self-dealing). Nothing on-chain
// is shown here; the cron route is the real public endpoint name only.

// Verdant — "success / started" accent (globals.css --verdant: #6f8f5a). Not in
// brand.ts; inlined here per Payoff.tsx, used ONLY on the started status pill.
const VERDANT = "#6f8f5a";

// The fires-at frame for the cron's 200 response.
const TICK = 64;

export const AutoIntro: React.FC = () => {
  const frame = useCurrentFrame();

  // Headline lands: fade + slight rise (brand entrance). Two spans, tasteful.
  const headEnter = useEnter(0, 30);
  const headRise = interpolate(headEnter, [0, 1], [16, 0]);

  // Mono subline writes on just after the headline anchors.
  const sublineIn = useEnter(16, 20);

  // Cron card settles in below as the headline finishes.
  const cardIn = interpolate(frame, [40, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...ENTER_BEZIER),
  });
  const cardRise = interpolate(cardIn, [0, 1], [14, 0]);

  // The cron fires at TICK: status pill flips waiting… → 200 · tick started.
  const started = frame >= TICK;
  const startedReveal = interpolate(frame, [TICK, TICK + 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...ENTER_BEZIER),
  });
  // ONE-SHOT amber glow pulse on the pill — swells then settles, never repeats.
  const glow = interpolate(
    frame,
    [TICK, TICK + 10, TICK + 34],
    [0, 0.7, 0.18],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(...ENTER_BEZIER),
    },
  );

  // Chips row writes on just after the card body.
  const chipsIn = interpolate(frame, [54, 72], [0, 1], {
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
          width: 1100,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {/* HEADLINE — the star. "No human." boneDim, "No buyer." bone. */}
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 500,
            fontSize: 82,
            lineHeight: 1.0,
            letterSpacing: -1,
            textAlign: "center",
            opacity: headEnter,
            transform: `translateY(${headRise}px)`,
          }}
        >
          <span style={{ color: COLORS.boneDim }}>No human.</span>{" "}
          <span style={{ color: COLORS.bone }}>No buyer.</span>
        </div>

        {/* SUBLINE — mono, uppercase, wide tracking. */}
        <div
          style={{
            marginTop: 22,
            fontFamily: FONT_MONO,
            fontSize: 22,
            textTransform: "uppercase",
            letterSpacing: "0.28em",
            color: COLORS.boneDim,
            opacity: sublineIn,
          }}
        >
          The daily curator tick runs itself.
        </div>

        {/* CRON-TRIGGER CARD — supporting evidence; ink-raised box. */}
        <div
          style={{
            marginTop: 54,
            width: 760,
            borderRadius: 3,
            border: `1px solid ${COLORS.inkLine}`,
            backgroundColor: "rgba(21,18,15,0.60)" /* ink-raised/60 */,
            padding: "18px 22px",
            boxShadow: "0 24px 70px -34px rgba(0,0,0,0.7)",
            opacity: cardIn,
            transform: `translateY(${cardRise}px)`,
          }}
        >
          {/* log cluster — line 1 (source · time) + status pill on the right */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 18,
            }}
          >
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 15,
                letterSpacing: "0.04em",
                color: COLORS.boneDim,
              }}
            >
              ▸ vercel cron · 00:00 UTC
            </span>
            {/* status pill — flips waiting… → verdant 200 · tick started */}
            <span
              style={{
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                borderRadius: 2,
                border: `1px solid ${
                  started ? "rgba(111,143,90,0.5)" : COLORS.inkLine
                }`,
                backgroundColor: started
                  ? "rgba(111,143,90,0.10)"
                  : "rgba(21,18,15,0.4)",
                padding: "5px 11px",
                fontFamily: FONT_MONO,
                fontSize: 14,
                textTransform: "uppercase",
                letterSpacing: 1.5,
                color: started ? VERDANT : COLORS.boneDim,
                boxShadow: started
                  ? `0 0 22px -4px rgba(232,161,58,${glow})`
                  : "none",
              }}
            >
              {started ? (
                <span style={{ opacity: startedReveal }}>200 · tick started</span>
              ) : (
                "waiting…"
              )}
            </span>
          </div>

          {/* line 2 — GET + amber route path */}
          <div
            style={{
              marginTop: 14,
              fontFamily: FONT_MONO,
              fontSize: 22,
              letterSpacing: "-0.01em",
              color: COLORS.bone,
            }}
          >
            GET <span style={{ color: COLORS.amber }}>/api/cron/autonomous-tick</span>
          </div>

          {/* chips row — small mono uppercase chips, ink-line border, boneDim */}
          <div
            style={{
              marginTop: 18,
              display: "flex",
              gap: 8,
              opacity: chipsIn,
            }}
          >
            {["no human", "no buyer", "agent-funded"].map((chip) => (
              <span
                key={chip}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  borderRadius: 2,
                  border: `1px solid ${COLORS.inkLine}`,
                  backgroundColor: "rgba(21,18,15,0.4)",
                  padding: "5px 10px",
                  fontFamily: FONT_MONO,
                  fontSize: 13,
                  textTransform: "uppercase",
                  letterSpacing: 1.5,
                  color: COLORS.boneDim,
                }}
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
