import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS } from "../brand";
import { FONT_DISPLAY, FONT_MONO } from "../fonts";
import { useEnter } from "../helpers";

// ACTIVITY (7s, local 0–210): the /activity page — the standing public PROOF
// surface — and the closing ask: go watch the autonomous tick run, live. The URL
// is shown DOMAIN-AGNOSTIC (path-only /activity, like Source's and Payoff's
// masked domains) so the clip stays versatile — the real link is shared
// out-of-band, not baked into the frame.
//
// Layout mirrors Payoff's UrlChrome (browser top bar) over an inline /activity
// page: header → three streamed tick-log rows (each a curator pick with three
// on-chain proof chips) → a CTA band driving to /activity.
//
// PROVENANCE HONESTY: every row is a 'curator' pick (the autonomous tick log =
// the real Cat-2 volume). Signatures are TRUNCATED + ILLUSTRATIVE only (promo,
// no live chain call) — Payoff.tsx's 8…6 convention. All motion via interpolate.

// Verdant — "settled / success" accent (globals.css --verdant: #6f8f5a),
// inlined per Payoff.tsx; used only on the settled x402 chip + provenance chip.
const VERDANT = "#6f8f5a";

const ACTIVITY_URL_PATH = "activity";

// Three tick-log rows, newest first. Row 1 MUST match Brain's decided subject
// exactly (wallet · "A whale wakes after 400 days"). Sigs are truncated display
// only. Kinds span wallet/token/nft to show the curator's range.
const ROWS: {
  ts: string;
  kind: string;
  title: string;
  x402: string;
  escrow: string;
  memo: string;
}[] = [
  {
    ts: "2026-05-31 00:00",
    kind: COLORS.wallet,
    title: "A whale wakes after 400 days",
    x402: "5Qm8kP2x…ZrT9aQ",
    escrow: "8Wp3rL9d…Kv2nHb",
    memo: "3Nf7wY9b…uK4mEx",
  },
  {
    ts: "2026-05-30 00:00",
    kind: COLORS.token,
    title: "$WIF and the hat that ate Solana",
    x402: "2Hs6tV4c…Qy7bRn",
    escrow: "9Lk1mZ8e…Wc5dFp",
    memo: "6Bn4xC2a…Tj8sVu",
  },
  {
    ts: "2026-05-29 00:00",
    kind: COLORS.nft,
    title: "Mad Lads #4872 — a quiet provenance",
    x402: "4Dp9wQ3f…Hn2kLm",
    escrow: "7Rt2yB6g…Zx4cVq",
    memo: "1Cs8vN5h…Pe9bWd",
  },
];

// A single on-chain proof chip (mono uppercase) — mirrors Payoff's ProofLink.
const ProofChip: React.FC<{ label: string; sig: string; tone: string }> = ({
  label,
  sig,
  tone,
}) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 7,
      borderRadius: 2,
      border: `1px solid ${COLORS.inkLine}`,
      backgroundColor: "rgba(21,18,15,0.4)",
      padding: "6px 10px",
      fontFamily: FONT_MONO,
      fontSize: 13,
      textTransform: "uppercase",
      letterSpacing: 1,
    }}
  >
    <span style={{ color: COLORS.boneDim }}>{label}</span>
    <span style={{ color: tone }}>{sig}</span>
    <span aria-hidden style={{ color: COLORS.boneDim }}>
      ↗
    </span>
  </span>
);

// One streamed tick-log row card.
const TickRow: React.FC<{ row: (typeof ROWS)[number]; delay: number }> = ({
  row,
  delay,
}) => {
  const enter = useEnter(delay, 22);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 24,
        borderRadius: 3,
        border: `1px solid ${COLORS.inkLine}`,
        backgroundColor: "rgba(21,18,15,0.60)",
        padding: "16px 22px",
        opacity: enter,
        transform: `translateY(${interpolate(enter, [0, 1], [12, 0])}px)`,
      }}
    >
      {/* left — timestamp + kind dot + title + provenance chip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          minWidth: 0,
          flex: 1,
        }}
      >
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 14,
            color: COLORS.boneDim,
            flexShrink: 0,
          }}
        >
          {row.ts}
        </span>
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: 999,
            backgroundColor: row.kind,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 500,
            fontSize: 26,
            color: COLORS.bone,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {row.title}
        </span>
        <span
          style={{
            flexShrink: 0,
            borderRadius: 2,
            border: `1px solid rgba(111,143,90,0.4)`,
            padding: "3px 9px",
            fontFamily: FONT_MONO,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: 1.5,
            color: VERDANT,
          }}
        >
          curator pick
        </span>
      </div>

      {/* right — three on-chain proof chips */}
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <ProofChip label="x402" sig={row.x402} tone={VERDANT} />
        <ProofChip label="sap-x402" sig={row.escrow} tone={COLORS.amber} />
        <ProofChip label="memo v2" sig={row.memo} tone={COLORS.amber} />
      </div>
    </div>
  );
};

// Browser chrome — fixed top bar showing the /activity route, domain-agnostic
// (mirrors Payoff's UrlChrome; path-only so the clip stays link-versatile).
const UrlChrome: React.FC = () => {
  const frame = useCurrentFrame();
  const chromeIn = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 60,
        display: "flex",
        alignItems: "center",
        gap: 20,
        padding: "0 20px",
        backgroundColor: COLORS.inkSoft,
        borderBottom: `1px solid ${COLORS.inkLine}`,
        opacity: chromeIn,
      }}
    >
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              backgroundColor: "rgba(163,154,138,0.3)",
            }}
          />
        ))}
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          justifyContent: "center",
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
            maxWidth: "100%",
            borderRadius: 999,
            border: `1px solid ${COLORS.inkLine}`,
            backgroundColor: COLORS.ink,
            padding: "9px 22px",
            fontFamily: FONT_MONO,
            fontSize: 20,
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          <svg
            width={15}
            height={16}
            viewBox="0 0 16 18"
            fill="none"
            aria-hidden
            style={{ flexShrink: 0 }}
          >
            <rect
              x="2.5"
              y="7.5"
              width="11"
              height="8.5"
              rx="2"
              stroke={COLORS.amber}
              strokeWidth="1.4"
            />
            <path
              d="M5 7.5V5a3 3 0 0 1 6 0v2.5"
              stroke={COLORS.amber}
              strokeWidth="1.4"
            />
          </svg>
          <span style={{ color: COLORS.bone }}>/{ACTIVITY_URL_PATH}</span>
        </div>
      </div>
      <div style={{ width: 46, flexShrink: 0 }} />
    </div>
  );
};

export const Activity: React.FC = () => {
  // Page header settles in under the chrome.
  const headIn = useEnter(8, 22);

  // CTA band fades + rises in over the tail (the closing ask).
  const cta = useEnter(140, 26);

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.ink }}>
      {/* page content under the chrome */}
      <div
        style={{
          position: "absolute",
          top: 60,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 1480,
            paddingTop: 48,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* header — title + live tag + subline */}
          <div style={{ opacity: headIn }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 500,
                  fontSize: 52,
                  color: COLORS.bone,
                }}
              >
                Autonomous tick log
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontFamily: FONT_MONO,
                  fontSize: 14,
                  textTransform: "uppercase",
                  letterSpacing: 2,
                  color: VERDANT,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    backgroundColor: VERDANT,
                  }}
                />
                live
              </span>
            </div>
            <div
              style={{
                marginTop: 12,
                fontFamily: FONT_MONO,
                fontSize: 16,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                color: COLORS.boneDim,
              }}
            >
              every run, on-chain · the standing proof surface
            </div>
          </div>

          {/* tick rows */}
          <div
            style={{
              marginTop: 34,
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            {ROWS.map((row, i) => (
              <TickRow key={row.title} row={row} delay={10 + i * 14} />
            ))}
          </div>

          {/* CTA band — the closing ask: inspect /activity live */}
          <div
            style={{
              marginTop: 48,
              paddingTop: 34,
              borderTop: `1px solid ${COLORS.inkLine}`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
              opacity: cta,
              transform: `translateY(${interpolate(cta, [0, 1], [12, 0])}px)`,
            }}
          >
            <span
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 500,
                fontSize: 44,
                color: COLORS.bone,
              }}
            >
              Watch it run, live.
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 12,
                fontFamily: FONT_MONO,
                fontSize: 24,
                letterSpacing: "0.04em",
              }}
            >
              <span style={{ color: COLORS.boneDim }}>
                Inspect the tick log →
              </span>
              <span style={{ color: COLORS.amber }}>/activity</span>
              <span aria-hidden style={{ color: COLORS.amber }}>
                ↗
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* browser chrome — fixed top overlay, real /activity URL */}
      <UrlChrome />
    </AbsoluteFill>
  );
};
