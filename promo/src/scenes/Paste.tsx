import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS } from "../brand";
import { FONT_DISPLAY, FONT_MONO } from "../fonts";
import { Caption, useEnter } from "../helpers";

// PASTE 105–270f (5.5s, local 0–165): inline recreation of the homepage
// MintWidget paste surface (src/components/mint-widget.tsx). The "paste any
// address" promise made concrete on the BONK mint: the identifier types into
// the box in mono, the ledger line + focus ring brighten, the Preview button
// flips to "Reading…", and detection resolves to the quiet `token` hue.
//
// Copy + structure mirror the real surface; sizes are cinema-scale (hero card
// scale ~1.12) per the authorized divergence. All motion via interpolate().

const ADDRESS = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

// Real-product legend strings (mint-widget.tsx), unchanged.
const LEGEND = ["wallet", "tx signature", "nft", "token mint"];

export const Paste: React.FC = () => {
  const frame = useCurrentFrame();

  // Hero card entrance (fade + rise), brand settle easing.
  const card = useEnter(4, 28);

  // Paste — not typing. The full mint lands in the box at once on PASTE (f20),
  // with a 1-frame settle pop. Empty placeholder before; full address after.
  const PASTE = 20;
  const hasText = frame >= PASTE;
  const paste = interpolate(frame, [PASTE, PASTE + 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Focus state: the box lights the instant the address is pasted and stays lit.
  // 0 → 1 drives ledger-line brightness, border tint, and the inset glow ring.
  const focus = interpolate(frame, [PASTE, PASTE + 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Button copy: "Preview" → "Reading…" (60–88f, while detection runs) →
  // resolved. The detected badge + facts then rise in.
  const reading = frame >= 60 && frame < 88;
  const resolved = interpolate(frame, [88, 104], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // amber ledger line brightness (bg-amber/50 → bg-amber on focus).
  const ledger = interpolate(focus, [0, 1], [0.5, 1]);
  // focus-within border + dual-layer inset/outer glow strength.
  const ring = focus;

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
          // Hero card scale ~1.12 (anchor from prior cut).
          width: 1180,
          transform: `scale(1.12) translateY(${interpolate(card, [0, 1], [26, 0])}px)`,
          opacity: card,
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        {/* Label cluster: amber "Start here" eyebrow + display sub-label. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Caption
            delay={6}
            fontFamily={FONT_MONO}
            color={COLORS.amber}
            size={20}
            weight={500}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              textTransform: "uppercase",
              letterSpacing: "0.3em",
            }}
          >
            <span aria-hidden>✦</span>
            Start here
          </Caption>
          <Caption
            delay={10}
            fontFamily={FONT_DISPLAY}
            color={COLORS.bone}
            size={40}
            weight={500}
          >
            Paste a Solana identifier
          </Caption>
        </div>

        {/* The input box — left amber ledger line, mono text, Preview button. */}
        <div
          style={{
            display: "flex",
            alignItems: "stretch",
            overflow: "hidden",
            borderRadius: 4,
            borderStyle: "solid",
            borderWidth: 1,
            // bone-faint/30 → amber as focus settles.
            borderColor:
              ring > 0.5 ? COLORS.amber : "rgba(163,154,138,0.30)",
            backgroundColor: "rgba(21,18,15,0.80)" /* ink-raised/80 */,
            padding: 8,
            // Dual-layer focus glow: inset amber + outer amber ring.
            boxShadow: `inset 0 0 ${interpolate(ring, [0, 1], [40, 52])}px ${interpolate(
              ring,
              [0, 1],
              [-26, -22],
            )}px rgba(232,161,58,${interpolate(ring, [0, 1], [0.7, 0.85])}), 0 0 0 ${interpolate(
              ring,
              [0, 1],
              [0, 4],
            )}px rgba(232,161,58,${interpolate(ring, [0, 1], [0, 0.12])})`,
          }}
        >
          {/* amber ledger line — the active entry rule; brightens on focus. */}
          <span
            aria-hidden
            style={{
              width: 4,
              flexShrink: 0,
              alignSelf: "stretch",
              borderRadius: 999,
              backgroundColor: COLORS.amber,
              opacity: ledger,
            }}
          />
          {/* the pasted identifier in mono (mirrors the real <input>). */}
          <div
            style={{
              minWidth: 0,
              flex: 1,
              display: "flex",
              alignItems: "center",
              padding: "16px 18px",
              fontFamily: FONT_MONO,
              fontSize: 26,
              color: hasText ? COLORS.bone : "rgba(163,154,138,0.70)",
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
          >
            <span
              style={{
                opacity: hasText ? paste : 1,
                transform: hasText
                  ? `scale(${interpolate(paste, [0, 1], [0.98, 1])})`
                  : "none",
                transformOrigin: "left center",
              }}
            >
              {hasText ? ADDRESS : "address, signature, or mint…"}
            </span>
          </div>
          {/* Preview button — mono, uppercase; disabled until there's text. */}
          <div
            style={{
              flexShrink: 0,
              alignSelf: "stretch",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 2,
              padding: "0 26px",
              fontFamily: FONT_MONO,
              fontSize: 18,
              textTransform: "uppercase",
              letterSpacing: "0.18em",
              // Enabled (amber/40 border, amber/10 bg) once there's an address.
              border: `1px solid ${
                hasText ? "rgba(232,161,58,0.40)" : "transparent"
              }`,
              backgroundColor: hasText
                ? "rgba(232,161,58,0.10)"
                : "transparent",
              color: hasText ? COLORS.amber : "rgba(163,154,138,0.40)",
            }}
          >
            {reading ? "Reading…" : "Preview"}
          </div>
        </div>

        {/* Accepted-kinds legend — full, no truncation (real product copy). */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 14,
            fontFamily: FONT_MONO,
            fontSize: 16,
            textTransform: "uppercase",
            letterSpacing: "0.16em",
            color: "rgba(163,154,138,0.65)",
            opacity: useEnter(14, 18),
          }}
        >
          {LEGEND.map((kind, i) => (
            <span
              key={kind}
              style={{ display: "flex", alignItems: "center", gap: 14 }}
            >
              {i > 0 && (
                <span aria-hidden style={{ color: "rgba(232,161,58,0.40)" }}>
                  ·
                </span>
              )}
              {kind}
            </span>
          ))}
        </div>

        {/* One-line free-preview paragraph (kept to a single line per brief). */}
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 17,
            color: "rgba(163,154,138,0.65)",
            opacity: useEnter(18, 18),
          }}
        >
          Free preview — detected kind and a few on-chain facts. No spend, no AI
          yet.
        </div>

        {/* Detection result — the quiet `token` hue resolves in, then the free
            preview facts (supply / name) fill in. Mirrors the Preview header +
            KindBadge + fact list of the real preview panel (preview-facts.ts). */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            borderRadius: 3,
            border: `1px solid ${COLORS.inkLine}`,
            backgroundColor: "rgba(21,18,15,0.60)" /* ink-raised/60 */,
            padding: "18px 22px",
            opacity: resolved,
            transform: `translateY(${interpolate(resolved, [0, 1], [12, 0])}px)`,
          }}
        >
          {/* header row — Preview label + detected KindBadge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 15,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                color: COLORS.boneDim,
              }}
            >
              Preview
            </span>
            {/* KindBadge — token (quiet kind hue, small dot + label). */}
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                borderRadius: 2,
                padding: "5px 12px",
                fontFamily: FONT_MONO,
                fontSize: 15,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                color: COLORS.token,
                border: `1px solid rgba(90,160,135,0.40)`,
                backgroundColor: "rgba(90,160,135,0.08)",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  backgroundColor: COLORS.token,
                }}
              />
              Token
            </span>
          </div>
          {/* free preview facts — supply / name (free RPC, pre-payment) */}
          {[
            { label: "Supply", value: "87994729013945.34" },
            { label: "Name", value: "Bonk" },
          ].map((fact) => (
            <div
              key={fact.label}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: 14,
                paddingTop: 14,
                borderTop: `1px solid ${COLORS.inkLine}`,
                fontFamily: FONT_MONO,
                fontSize: 16,
              }}
            >
              <span
                style={{
                  textTransform: "uppercase",
                  letterSpacing: "0.18em",
                  color: COLORS.boneDim,
                }}
              >
                {fact.label}
              </span>
              <span style={{ color: COLORS.bone }}>{fact.value}</span>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
