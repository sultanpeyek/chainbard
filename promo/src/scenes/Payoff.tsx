import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { COLORS, ENTER_BEZIER } from "../brand";
import { FONT_DISPLAY, FONT_MONO } from "../fonts";
import { useEnter } from "../helpers";

// PAYOFF (13.2s, local 0–395):
//  The BONK story-page artifact lands. The hero (breadcrumb → subject image →
//  title) reveals and HOLDS first so the viewer reads "what this is", THEN the
//  tall column descends and the sealed provenance receipt settles DEAD-CENTER,
//  where a wax seal stamps "sealed". See-it-first, then sealed, centered,
//  triumphant, restrained. (Hold-then-descend replaces the old immediate pan.)
//
//  FROZEN INVARIANTS (do not change magnitudes — only timing):
//    PAN_DISTANCE = 1500   (translateY 0 → -1500)
//    SCALE        = 1.3
//  Layout is sized so the receipt's center sits at local y ≈ 1569 in the
//  unscaled column; with transformOrigin '50% 0%', after scale(1.3) + the full
//  -1500 pan it lands at screen y ≈ 540 (1080/2) → dead center. (Last pass sat
//  slightly low; padTop=225 corrects it.)
const PAN_DISTANCE = 1500; // FROZEN
const SCALE = 1.3; // FROZEN

// Verdant — "settled / success" accent (globals.css --verdant: #6f8f5a). Not in
// brand.ts; inlined here, used ONLY on the seal/badge/payment chip (quiet, small),
// per the real receipt's "buyer render" provenance source.
const VERDANT = "#6f8f5a";

// BONK subject (from recon). Full mint: DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263
const MINT_SHORT = "DezX…B263"; // truncateId(mint, 'address') → 4…4
// Settlement proof sigs (truncated display only — promo, no real chain call).
const PAYMENT_SHORT = "5Qm8kP2x…ZrT9aQ"; // truncateId(sig, 'tx') → 8…6
const MEMO_SHORT = "3Nf7wY9b…uK4mEx";

// --- Wax seal: the diamond-quatrefoil motif, mirrored from ProvenanceReceipt ---
const Seal: React.FC<{ accent: string; opacity: number; scale: number }> = ({
  accent,
  opacity,
  scale,
}) => (
  <svg
    viewBox="0 0 96 96"
    width={96}
    height={96}
    style={{
      flexShrink: 0,
      opacity,
      transform: `scale(${scale})`,
      transformOrigin: "center center",
    }}
    role="img"
    aria-label="chainbard seal"
  >
    <circle
      cx="48"
      cy="48"
      r="45"
      fill="none"
      stroke={accent}
      strokeWidth="1"
      opacity="0.55"
    />
    <circle
      cx="48"
      cy="48"
      r="38"
      fill="none"
      stroke={accent}
      strokeWidth="0.5"
      opacity="0.35"
      strokeDasharray="2 3"
    />
    <path
      d="M48 16 L80 48 L48 80 L16 48 Z M48 30 L66 48 L48 66 L30 48 Z"
      fill="none"
      stroke={accent}
      strokeWidth="0.8"
      opacity="0.7"
    />
    <text
      x="48"
      y="48"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize="22"
      fill={accent}
      opacity="0.95"
    >
      ✦
    </text>
  </svg>
);

// A single on-chain proof link chip (mono, uppercase) — mirrors ProofLink.
const ProofLink: React.FC<{
  label: string;
  sig: string;
  tone: string;
  opacity: number;
}> = ({ label, sig, tone, opacity }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      borderRadius: 2,
      border: `1px solid ${COLORS.inkLine}`,
      backgroundColor: "rgba(21,18,15,0.4)",
      padding: "7px 11px",
      fontFamily: FONT_MONO,
      fontSize: 15,
      textTransform: "uppercase",
      letterSpacing: 1,
      opacity,
    }}
  >
    <span style={{ color: COLORS.boneDim }}>{label}</span>
    <span style={{ color: tone }}>{sig}</span>
    <span aria-hidden style={{ color: COLORS.boneDim }}>
      ↗
    </span>
  </div>
);

// --- BROWSER CHROME ── the minted story is LIVE at a public URL ---------------
// Fixed top overlay (sibling of the panned column, NOT inside it), so the page
// content pans UNDER it like a real browser. Fades in early (0–14f) so the URL
// registers as the page reveals "what is inside".
const LIVE_DOMAIN = "***.***/";
const LIVE_PATH = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

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
      {/* three quiet monochrome window dots */}
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

      {/* rounded address field, centered */}
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
          {/* secure-lock glyph — monochrome amber vector (on-palette) */}
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
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ color: "rgba(163,154,138,0.5)" }}>https://</span>
            <span style={{ color: COLORS.boneDim }}>{LIVE_DOMAIN}</span>
            <span style={{ color: COLORS.bone }}>{LIVE_PATH}</span>
          </span>
        </div>
      </div>

      {/* right spacer balances the dots so the field stays optically centered */}
      <div style={{ width: 46, flexShrink: 0 }} />
    </div>
  );
};

export const Payoff: React.FC = () => {
  const frame = useCurrentFrame();

  // --- THE PAN (frozen magnitudes, tuned timing) ---------------------------
  // Hold-then-descend so the viewer reads "what this is" before the proof lands:
  //   0–45f    reveal   pan 0 → -300   (breadcrumb + hero/title settle in)
  //   45–120f  HOLD     stay at -300   (2.5s dwell on the BONK hero + title)
  //   120–195f descend  pan -300 → -1500 (drop to the provenance receipt)
  //   195–395f hold     receipt dead-center; the wax seal stamps here
  // transformOrigin '50% 0%', scale 1.3: -300 frames the hero card under the
  // chrome; the full -1500 lands the receipt center at screen y≈540. Brand
  // settle curve eases each move; the middle segment is a flat hold.
  const HOLD_Y = -300;
  const panY = interpolate(
    frame,
    [0, 45, 120, 195],
    [0, HOLD_Y, HOLD_Y, -PAN_DISTANCE],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(...ENTER_BEZIER),
    },
  );
  // Whole artifact fades up as the pan begins.
  const artifact = useEnter(0, 24);

  // --- THE SEAL MOMENT (punctuates "sealed", after the descent has settled) -
  // Stamp: a quick scale punch (1.35 → 1.0) + fade-in over 177–203f (the descent
  // lands the receipt dead-center at f195), then a calm amber glow swell that
  // fades. Badge flips unsealed → sealed at the stamp.
  const sealOpacity = interpolate(frame, [177, 195], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...ENTER_BEZIER),
  });
  const sealScale = interpolate(frame, [177, 203], [1.35, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...ENTER_BEZIER),
  });
  const sealed = frame >= 189;
  // Amber glow swell on the receipt shadow as it seals, then settle.
  const sealGlow = interpolate(
    frame,
    [183, 203, 237],
    [0.35, 0.85, 0.42],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(...ENTER_BEZIER),
    },
  );
  // Proof links write on just after the stamp.
  const proofOpacity = interpolate(frame, [197, 215], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...ENTER_BEZIER),
  });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.ink, overflow: "hidden" }}>
      {/* Tall story-page artifact — panned up, scaled 1.3, origin top-center.
          Centered horizontally; the column is 1080px wide (≈ live max-w-3xl). */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          width: 1080,
          marginLeft: -540,
          transformOrigin: "50% 0%",
          transform: `translateY(${panY}px) scale(${SCALE})`,
          opacity: artifact,
        }}
      >
        {/* padTop reserves space so the receipt center lands dead-center. The
            actual laid-out receipt center is ~1511 (not the 1569 first assumed),
            so it rendered ~76px high; +58px of top pad drops it to screen y≈540.
            Magnitudes (PAN_DISTANCE/SCALE) stay FROZEN — only this pad moves. */}
        <div style={{ height: 283 }} />

        {/* solana:// breadcrumb (mirrors share-page identifier line) */}
        <div
          style={{
            height: 46,
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            fontFamily: FONT_MONO,
            fontSize: 26,
          }}
        >
          <span style={{ color: "rgba(232,161,58,0.7)" }}>solana://</span>
          <span style={{ color: COLORS.boneDim }}>{MINT_SHORT}</span>
        </div>
        <div style={{ height: 28 }} />

        {/* Hero — atmospheric BONK image mock (warm amber-lit gradient + vignette),
            kind badge + title/tone overlay bottom-left (mirrors share-page hero). */}
        <div
          style={{
            position: "relative",
            height: 620,
            borderRadius: 4,
            overflow: "hidden",
            border: `1px solid ${COLORS.inkLine}`,
          }}
        >
          <Img
            src={staticFile("hero-meme.png")}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(to bottom, rgba(11,10,9,0.1) 35%, rgba(11,10,9,0.92) 100%)`,
            }}
          />
          {/* kind badge — token (quiet kind hue, small dot) */}
          <div
            style={{
              position: "absolute",
              top: 22,
              left: 24,
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontFamily: FONT_MONO,
              fontSize: 15,
              color: COLORS.bone,
              background: "rgba(11,10,9,0.55)",
              border: `1px solid ${COLORS.inkLine}`,
              borderRadius: 999,
              padding: "5px 11px",
            }}
          >
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: 999,
                backgroundColor: COLORS.token,
              }}
            />
            token
          </div>
          {/* tone badge + title overlay, bottom-left */}
          <div style={{ position: "absolute", left: 28, bottom: 26, right: 28 }}>
            <div
              style={{
                fontFamily: FONT_MONO,
                fontSize: 16,
                color: COLORS.amber,
                textTransform: "lowercase",
                letterSpacing: 0.5,
              }}
            >
              tone · triumphant
            </div>
            <div
              style={{
                marginTop: 12,
                fontFamily: FONT_DISPLAY,
                fontWeight: 500,
                fontSize: 64,
                lineHeight: 1.0,
                color: COLORS.bone,
                letterSpacing: -0.5,
              }}
            >
              BONK - The Meme That Saved Solana
            </div>
          </div>
        </div>
        <div style={{ height: 40 }} />

        {/* Title block beneath hero — subtitle + brand line (story body stand-in) */}
        <div style={{ height: 200 }}>
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontStyle: "italic",
              fontSize: 30,
              color: COLORS.boneDim,
              lineHeight: 1.4,
            }}
          >
            How a stray dog meme became the heartbeat of a chain — minted,
            sealed, and yours to keep.
          </div>
        </div>
        <div style={{ height: 44 }} />

        {/* Verdict — quote block with amber left border (mirrors share-page) */}
        <div
          style={{
            height: 170,
            borderLeft: `2px solid rgba(232,161,58,0.6)`,
            paddingLeft: 28,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 15,
              textTransform: "uppercase",
              letterSpacing: 2,
              color: COLORS.amber,
            }}
          >
            Verdict
          </div>
          <div
            style={{
              marginTop: 14,
              fontFamily: FONT_DISPLAY,
              fontSize: 34,
              color: COLORS.bone,
              lineHeight: 1.3,
            }}
          >
            Every address holds a story. This one barks.
          </div>
        </div>
        <div style={{ height: 46 }} />

        {/* ── PROVENANCE RECEIPT ── lands dead-center; the seal stamps here.
            Mirrors ProvenanceReceipt: header (chainbard seal · verifiable
            on-chain + sealed badge), seal + source (buyer render / minted on
            demand · paid in USDC, verdant accent), identifier + proof links. */}
        <div
          style={{
            overflow: "hidden",
            borderRadius: 4,
            border: `1px solid ${COLORS.inkLine}`,
            backgroundColor: "rgba(21,18,15,0.3)",
            boxShadow: `0 0 60px -18px rgba(232,161,58,${sealGlow})`,
          }}
        >
          {/* header row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: `1px solid ${COLORS.inkLine}`,
              padding: "12px 20px",
            }}
          >
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 14,
                textTransform: "uppercase",
                letterSpacing: 2,
                color: COLORS.boneDim,
              }}
            >
              chainbard seal · verifiable on-chain
            </span>
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 14,
                textTransform: "uppercase",
                letterSpacing: 1.5,
                color: sealed ? VERDANT : COLORS.boneDim,
              }}
            >
              {sealed ? "sealed" : "unsealed"}
            </span>
          </div>

          {/* body row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 28,
              padding: "22px 20px",
            }}
          >
            {/* seal + source authority */}
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <Seal
                accent={VERDANT}
                opacity={sealOpacity}
                scale={sealScale}
              />
              <div>
                <div
                  style={{
                    display: "inline-block",
                    borderRadius: 2,
                    border: `1px solid rgba(111,143,90,0.4)`,
                    padding: "3px 9px",
                    fontFamily: FONT_MONO,
                    fontSize: 13,
                    textTransform: "uppercase",
                    letterSpacing: 1.5,
                    color: VERDANT,
                  }}
                >
                  buyer render
                </div>
                <div
                  style={{
                    marginTop: 8,
                    fontFamily: FONT_DISPLAY,
                    fontSize: 18,
                    color: COLORS.boneDim,
                  }}
                >
                  minted on demand · paid in USDC
                </div>
              </div>
            </div>

            {/* divider */}
            <div style={{ width: 1, alignSelf: "stretch", backgroundColor: COLORS.inkLine }} />

            {/* identifier + proof links */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                  fontFamily: FONT_MONO,
                  fontSize: 16,
                }}
              >
                <span style={{ color: "rgba(232,161,58,0.7)" }}>
                  solana://token saga
                </span>
                <span style={{ color: COLORS.boneDim }}>{MINT_SHORT}</span>
              </div>
              <div
                style={{
                  marginTop: 14,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <ProofLink
                  label="payment"
                  sig={PAYMENT_SHORT}
                  tone={VERDANT}
                  opacity={proofOpacity}
                />
                <ProofLink
                  label="sap memo"
                  sig={MEMO_SHORT}
                  tone={COLORS.amber}
                  opacity={proofOpacity}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Browser chrome — fixed top overlay, ON TOP of the panned column. The
          page content pans UNDER it. Sibling of the column → geometry untouched. */}
      <UrlChrome />
    </AbsoluteFill>
  );
};
