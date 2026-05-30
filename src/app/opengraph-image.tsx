import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

// --- image metadata (Next 16 opengraph-image file convention) ---------------

export const alt = 'chainbard — an autonomous on-chain Solana storyteller';

export const size = { width: 1200, height: 630 };

export const contentType = 'image/png';

// Static brand card: no request-time data, so let it be built once and cached.
export const revalidate = false;

// --- palette ("ledger almanac") ---------------------------------------------
// CSS vars don't resolve inside ImageResponse, so we use the raw hex tokens.

const INK = '#0b0a09';
const INK_LINE = '#2a2622';
const BONE = '#ece4d6';
const BONE_DIM = '#9b9182';
const BONE_FAINT = '#6a6256';
const AMBER = '#e8a13a';

// Fraunces for the wordmark + tagline. Load from Google Fonts, but never let a
// network hiccup crash the card — fall back to a serif stack on any failure.
async function loadFraunces(): Promise<
  { name: string; data: ArrayBuffer; style: 'normal'; weight: 600 }[]
> {
  try {
    const css = await fetch(
      'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&display=swap',
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
    ).then((r) => r.text());

    const url = css.match(/src: url\((https:\/\/[^)]+\.(?:woff2|ttf|otf))\)/)?.[1];
    if (!url) return [];

    const data = await fetch(url).then((r) => r.arrayBuffer());
    return [{ name: 'Fraunces', data, style: 'normal', weight: 600 }];
  } catch {
    return [];
  }
}

// --- image generation -------------------------------------------------------

export default async function Image() {
  const [logoData, fonts] = await Promise.all([
    readFile(join(process.cwd(), 'public/chainbard-logo.png'), 'base64'),
    loadFraunces(),
  ]);
  const logoSrc = `data:image/png;base64,${logoData}`;

  // Use the loaded serif when present, otherwise a high-contrast serif stack.
  const serif =
    fonts.length > 0
      ? "'Fraunces', Georgia, 'Times New Roman', serif"
      : "Georgia, 'Times New Roman', serif";

  return new ImageResponse(
    <div
      style={{
        width: '1200px',
        height: '630px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '64px 80px',
        background: INK,
        backgroundImage: `radial-gradient(120% 90% at 18% 8%, ${AMBER}22 0%, ${AMBER}0a 26%, ${INK}00 52%), linear-gradient(160deg, #131110 0%, ${INK} 100%)`,
        position: 'relative',
        overflow: 'hidden',
        color: BONE,
      }}
    >
      {/* Faint geometric diamond accents — decoration is geometry only (ADR 0002). */}
      <div
        style={{
          position: 'absolute',
          right: '-150px',
          bottom: '-150px',
          width: '540px',
          height: '540px',
          border: `1px solid ${AMBER}1f`,
          transform: 'rotate(45deg)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: '-70px',
          bottom: '-70px',
          width: '360px',
          height: '360px',
          border: `1px solid ${AMBER}14`,
          transform: 'rotate(45deg)',
        }}
      />

      {/* Brand lockup: cap logo + wordmark + tagline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '44px', marginTop: '24px' }}>
        {/* biome-ignore lint/performance/noImgElement: ImageResponse renders via Satori, not the DOM. */}
        <img src={logoSrc} width={308} height={308} alt="" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', maxWidth: '640px' }}>
          <div
            style={{
              fontFamily: serif,
              fontSize: '128px',
              fontWeight: 600,
              lineHeight: 1,
              letterSpacing: '-3px',
              color: BONE,
            }}
          >
            chainbard
          </div>
          <div
            style={{
              fontFamily: serif,
              fontSize: '29px',
              fontStyle: 'italic',
              lineHeight: 1.35,
              color: BONE_DIM,
            }}
          >
            Every wallet, transaction, NFT, and token has a story.
          </div>
        </div>
      </div>

      {/* Footer hairline row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: '28px',
          borderTop: `1px solid ${INK_LINE}`,
        }}
      >
        <div
          style={{
            fontSize: '15px',
            fontFamily: 'monospace',
            letterSpacing: '4px',
            textTransform: 'uppercase',
            color: BONE_FAINT,
          }}
        >
          chainbard
        </div>
        <div style={{ fontSize: '15px', fontFamily: 'monospace', color: BONE_FAINT }}>
          an autonomous on-chain Solana storyteller
        </div>
      </div>
    </div>,
    { ...size, fonts },
  );
}
