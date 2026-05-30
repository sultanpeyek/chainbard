import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { COLORS, ENTER_BEZIER } from "../brand";
import { FONT_DISPLAY, FONT_MONO } from "../fonts";

// SOURCE 105–165f (2s, local 0–60): a foreign, CoinGecko-style BONK price page
// floats on the ChainBard ink ground. A cursor glides to the page's [copy]
// button and copies the contract address — the bridge between "I saw it on a
// price site" and the PASTE beat. Self-contained 60-frame beat; HARD-CUTS to
// PASTE at f60 (no exit fade — the Sequence cut handles it).
//
// COPYRIGHT SAFETY: evokes the category only. No real logo/wordmark/gecko mark;
// the domain is fully MASKED (***.***/bonk). Page body is a deliberately
// NON-brand neutral dark; the "up" accent is a generic crypto green (#2ebd85),
// NOT CoinGecko's exact palette/layout. Tab labels + a generic green area chart
// are not protectable.
//
// All motion via useCurrentFrame() + interpolate (ENTER_BEZIER where it settles).

// Generic crypto "up" green — foreign-site accent, NOT a ChainBard brand signal.
const GREEN = "#2ebd85";
// Foreign-site avatar — a plain orange disc, no real logo.
const AVATAR = "#f08c1a";

// BONK mint. Full: DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263
const CONTRACT_SHORT = "DezXAZ8z7Pnr…aB1pPB263";

// --- WINDOW GEOMETRY (fixed + centered, so cursor coords are deterministic) ---
const STAGE_W = 1920;
const STAGE_H = 1080;
const WIN_W = 1180;
const WIN_H = 700;
const WIN_LEFT = (STAGE_W - WIN_W) / 2; // 370
const WIN_TOP = (STAGE_H - WIN_H) / 2; // 190

// --- COPY BUTTON + CURSOR TARGET (shared screen-space constants) --------------
// The contract row sits at the window's bottom; the [copy] button is right-
// aligned inside it. These screen coords place the button AND the cursor target
// so the cursor lands ON the button center. Tunable by the main thread.
const COPY_BTN_W = 132;
const COPY_BTN_H = 50;
// Button center, screen-space. Right inset 56 from window right edge; vertical
// center aligned to the contract row (44 up from window bottom edge region).
const COPY_BTN_CX = WIN_LEFT + WIN_W - 56 - COPY_BTN_W / 2; // 1418
const COPY_BTN_CY = WIN_TOP + WIN_H - 70; // 820
// The arrow cursor tip lands on the button center.
const CURSOR_TARGET_X = COPY_BTN_CX;
const CURSOR_TARGET_Y = COPY_BTN_CY;
// Cursor enters from lower-right of the stage.
const CURSOR_START_X = 1640;
const CURSOR_START_Y = 980;

// Believable jagged 24H area path (static). Drawn in a 1068×140 viewBox; the
// fill closes to the baseline. Trend nets slightly up to suit the green ▲.
const CHART_W = 1068;
const CHART_H = 140;
const LINE_PATH =
  "M0 96 L62 84 L124 100 L186 70 L248 88 L310 58 L372 74 L434 50 L496 66 L558 40 L620 60 L682 44 L744 70 L806 52 L868 64 L930 38 L992 54 L1068 30";
const AREA_PATH = `${LINE_PATH} L${CHART_W} ${CHART_H} L0 ${CHART_H} Z`;

// --- Arrow cursor — a classic pointer, neutral bone fill, dark outline --------
const Cursor: React.FC<{ x: number; y: number; scale: number }> = ({
  x,
  y,
  scale,
}) => (
  <svg
    width={28}
    height={28}
    viewBox="0 0 28 28"
    fill="none"
    aria-hidden
    style={{
      position: "absolute",
      left: x,
      top: y,
      transform: `scale(${scale})`,
      transformOrigin: "6px 6px",
    }}
  >
    <path
      d="M3 2 L3 23 L9 17 L13 26 L17 24 L13 15 L21 15 Z"
      fill={COLORS.bone}
      stroke={COLORS.ink}
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
  </svg>
);

export const Source: React.FC = () => {
  const frame = useCurrentFrame();

  // 0..14 — window fades in + slight rise (useEnter-style, ENTER_BEZIER).
  const enter = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...ENTER_BEZIER),
  });
  const rise = interpolate(enter, [0, 1], [26, 0]);

  // 14..34 — cursor glides from lower-right toward the copy button center.
  const glide = interpolate(frame, [14, 34], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...ENTER_BEZIER),
  });
  const cursorX = interpolate(glide, [0, 1], [CURSOR_START_X, CURSOR_TARGET_X]);
  const cursorY = interpolate(glide, [0, 1], [CURSOR_START_Y, CURSOR_TARGET_Y]);

  // 34..40 — click: cursor dips to ~0.9 then recovers.
  const cursorScale = interpolate(
    frame,
    [34, 37, 40],
    [1, 0.9, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(...ENTER_BEZIER),
    },
  );

  // 34..40 — copy button depresses (bg + scale dip).
  const press = interpolate(frame, [34, 37, 40], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const btnScale = interpolate(press, [0, 1], [1, 0.94]);

  // 40..60 — button flips to "Copied ✓" (green) with a tiny check fade-in.
  const copied = frame >= 40;
  const copiedReveal = interpolate(frame, [40, 48], [0, 1], {
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
      {/* The floating browser window — fixed size, centered. */}
      <div
        style={{
          width: WIN_W,
          height: WIN_H,
          opacity: enter,
          transform: `translateY(${rise}px)`,
          display: "flex",
          flexDirection: "column",
          borderRadius: 8,
          overflow: "hidden",
          border: `1px solid ${COLORS.inkLine}`,
          backgroundColor: "#14161a" /* neutral non-brand dark page body */,
          boxShadow: "0 40px 120px -40px rgba(0,0,0,0.7)",
        }}
      >
        {/* 1) Browser chrome bar (UrlChrome language) — neutral gray lock. */}
        <div
          style={{
            height: 56,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 20,
            padding: "0 18px",
            backgroundColor: "#0f1115",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {/* three monochrome window dots */}
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: 999,
                  backgroundColor: "rgba(255,255,255,0.18)",
                }}
              />
            ))}
          </div>

          {/* rounded address field, centered — fully masked domain */}
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
                border: "1px solid rgba(255,255,255,0.08)",
                backgroundColor: "#1b1e24",
                padding: "9px 22px",
                fontFamily: FONT_MONO,
                fontSize: 19,
                lineHeight: 1,
                whiteSpace: "nowrap",
              }}
            >
              {/* secure-lock glyph — NEUTRAL GRAY (foreign site, no brand signal) */}
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
                  stroke="rgba(255,255,255,0.45)"
                  strokeWidth="1.4"
                />
                <path
                  d="M5 7.5V5a3 3 0 0 1 6 0v2.5"
                  stroke="rgba(255,255,255,0.45)"
                  strokeWidth="1.4"
                />
              </svg>
              <span>
                <span style={{ color: "rgba(255,255,255,0.35)" }}>
                  https://
                </span>
                <span style={{ color: COLORS.boneDim }}>***.***/</span>
                <span style={{ color: COLORS.bone }}>bonk</span>
              </span>
            </div>
          </div>

          {/* right spacer balances the dots so the field stays optically centered */}
          <div style={{ width: 49, flexShrink: 0 }} />
        </div>

        {/* Page body */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            padding: "30px 40px",
            minHeight: 0,
          }}
        >
          {/* 2) Token header row */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* generic round token avatar — plain orange disc, no real logo */}
            <span
              style={{
                width: 48,
                height: 48,
                borderRadius: 999,
                backgroundColor: AVATAR,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 600,
                fontSize: 40,
                color: COLORS.bone,
                lineHeight: 1,
              }}
            >
              Bonk
            </span>
            {/* ticker chip (mono) */}
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 16,
                letterSpacing: 1,
                color: "rgba(255,255,255,0.7)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 4,
                padding: "4px 9px",
              }}
            >
              BONK
            </span>
          </div>

          {/* 3) Price — big green, subscript-zero notation, small ▲ */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 16,
              marginTop: 26,
            }}
          >
            <span
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 600,
                fontSize: 64,
                color: GREEN,
                lineHeight: 1,
              }}
            >
              $0.0
              <sub style={{ fontSize: 34, verticalAlign: "baseline" }}>5</sub>
              55
            </span>
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 22,
                color: GREEN,
                paddingBottom: 8,
              }}
            >
              ▲ 1.2%
            </span>
          </div>

          {/* 4) Green area chart — SVG area + line, ~full width × 140 tall */}
          <svg
            width="100%"
            height={CHART_H}
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            preserveAspectRatio="none"
            aria-hidden
            style={{ marginTop: 24, display: "block" }}
          >
            <defs>
              <linearGradient id="bonkArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={GREEN} stopOpacity="0.28" />
                <stop offset="100%" stopColor={GREEN} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={AREA_PATH} fill="url(#bonkArea)" />
            <path
              d={LINE_PATH}
              fill="none"
              stroke={GREEN}
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>

          {/* 5) Timeframe tabs row */}
          <div
            style={{
              display: "flex",
              gap: 10,
              marginTop: 22,
            }}
          >
            {["24H", "7D", "1M", "3M", "1Y"].map((tf) => {
              const active = tf === "24H";
              return (
                <span
                  key={tf}
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 15,
                    letterSpacing: 1,
                    padding: "6px 14px",
                    borderRadius: 6,
                    color: active ? GREEN : "rgba(255,255,255,0.4)",
                    backgroundColor: active
                      ? "rgba(46,189,133,0.12)"
                      : "transparent",
                    border: active
                      ? "1px solid rgba(46,189,133,0.4)"
                      : "1px solid transparent",
                  }}
                >
                  {tf}
                </span>
              );
            })}
          </div>

          {/* spacer pushes the contract row to the bottom of the window */}
          <div style={{ flex: 1 }} />

          {/* 6) Contract row — the action. Label + truncated address + [copy]. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              borderTop: "1px solid rgba(255,255,255,0.07)",
              paddingTop: 26,
            }}
          >
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 14,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.4)",
                flexShrink: 0,
              }}
            >
              Contract
            </span>
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontFamily: FONT_MONO,
                fontSize: 22,
                color: "rgba(255,255,255,0.85)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {CONTRACT_SHORT}
            </span>
            {/* [copy] button — depresses on click, flips to "Copied ✓" */}
            <span
              style={{
                flexShrink: 0,
                width: COPY_BTN_W,
                height: COPY_BTN_H,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                borderRadius: 8,
                fontFamily: FONT_MONO,
                fontSize: 16,
                letterSpacing: 1,
                transform: `scale(${btnScale})`,
                transformOrigin: "center center",
                color: copied ? GREEN : "rgba(255,255,255,0.8)",
                border: `1px solid ${
                  copied ? "rgba(46,189,133,0.5)" : "rgba(255,255,255,0.14)"
                }`,
                backgroundColor: copied
                  ? "rgba(46,189,133,0.12)"
                  : `rgba(255,255,255,${interpolate(press, [0, 1], [0.05, 0.14])})`,
              }}
            >
              {copied ? (
                <span style={{ opacity: copiedReveal }}>Copied ✓</span>
              ) : (
                <>
                  {/* clipboard glyph */}
                  <svg
                    width={16}
                    height={16}
                    viewBox="0 0 18 18"
                    fill="none"
                    aria-hidden
                  >
                    <rect
                      x="4.5"
                      y="3.5"
                      width="10"
                      height="12"
                      rx="2"
                      stroke="currentColor"
                      strokeWidth="1.4"
                    />
                    <path
                      d="M7 3.5V3a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 12 3v0.5"
                      stroke="currentColor"
                      strokeWidth="1.4"
                    />
                  </svg>
                  copy
                </>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Cursor — screen-space, glides to the copy button center then clicks. */}
      <Cursor x={cursorX} y={cursorY} scale={cursorScale} />
    </AbsoluteFill>
  );
};
