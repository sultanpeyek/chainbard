import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';
import {
  FIXTURE_WALLET,
  FIXTURE_WALLET_STORY,
  NFT_FIXTURE,
  NFT_FIXTURE_MINT,
} from '@/components/share-fixtures';

// Cache the OG image so social-card scrapers don't regenerate it on every hit.
export const revalidate = 60;

// --- types ------------------------------------------------------------------

export type Provenance = 'seed' | 'buyer' | 'curator';

type StoryMeta = {
  kind: string;
  title: string;
  subtitle: string;
  provenance: Provenance;
};

// --- ledger-almanac palette -------------------------------------------------
// One unified scheme for every story (CSS vars don't resolve inside Satori, so
// the brand tokens are inlined as hex here). The KIND badge picks a per-kind
// hue so wallet/tx/nft/token stay distinct; everything else is shared ground.

const INK = '#0b0a09'; // page ground, near-black warm
const BONE = '#ece4d6'; // primary text
const BONE_DIM = '#9b9182'; // subtitle
const AMBER = '#e8a13a'; // single accent / the lantern

const KIND_COLOR: Record<string, string> = {
  wallet: '#c9a24a',
  tx: '#7ba2c4',
  nft: '#b07cc6',
  token: '#5aa087',
};

// --- fixture map ------------------------------------------------------------
// Source of truth for title/subtitle/kind is the fixture components, so the
// OG card cannot drift from the rendered share page.

const STORIES: Record<string, StoryMeta> = {
  [FIXTURE_WALLET]: {
    kind: FIXTURE_WALLET_STORY.kind,
    title: FIXTURE_WALLET_STORY.title,
    subtitle: FIXTURE_WALLET_STORY.subtitle,
    provenance: 'seed',
  },
  [NFT_FIXTURE_MINT]: {
    kind: NFT_FIXTURE.kind,
    title: NFT_FIXTURE.title,
    subtitle: NFT_FIXTURE.subtitle,
    provenance: 'curator',
  },
};

const FALLBACK: StoryMeta = {
  kind: 'wallet',
  title: 'An On-Chain Story',
  subtitle: 'Powered by chainbard.',
  provenance: 'seed',
};

const PROVENANCE_LABEL: Record<Provenance, string> = {
  seed: 'seeded',
  buyer: 'generated-by-buyer',
  curator: 'curated-daily',
};

const PROVENANCE_COLOR: Record<Provenance, string> = {
  seed: '#6f8f5a', // verdant
  buyer: '#e8a13a', // amber
  curator: '#b9741b', // amber-deep
};

// --- route handler ----------------------------------------------------------

export async function GET(_req: NextRequest, { params }: { params: Promise<{ input: string }> }) {
  const { input } = await params;
  const decoded = decodeURIComponent(input);
  const s = STORIES[decoded] ?? { ...FALLBACK, title: `${decoded.slice(0, 20)}…` };
  const provLabel = PROVENANCE_LABEL[s.provenance];
  const provColor = PROVENANCE_COLOR[s.provenance];
  const kindColor = KIND_COLOR[s.kind] ?? AMBER;

  // Read the cap mark at request time (process.cwd() is the project root) and
  // inline it as a data URI so Satori can render it without a network fetch.
  const logoData = await readFile(join(process.cwd(), 'public', 'chainbard-logo.png'));
  const logoSrc = `data:image/png;base64,${logoData.toString('base64')}`;

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
        position: 'relative',
        overflow: 'hidden',
        color: BONE,
      }}
    >
      {/* Warm amber vignette over the warm-black ground */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(120% 90% at 50% 0%, ${AMBER}1f 0%, ${AMBER}00 45%, ${INK} 100%)`,
        }}
      />

      {/* Geometric diamond accents */}
      <div
        style={{
          position: 'absolute',
          right: '-120px',
          top: '-120px',
          width: '520px',
          height: '520px',
          border: `1px solid ${kindColor}25`,
          transform: 'rotate(45deg)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: '-40px',
          top: '-40px',
          width: '360px',
          height: '360px',
          border: `1px solid ${kindColor}18`,
          transform: 'rotate(45deg)',
        }}
      />

      {/* Kind + provenance badges */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <div
          style={{
            background: `${kindColor}1f`,
            border: `1px solid ${kindColor}55`,
            borderRadius: '6px',
            padding: '6px 16px',
            fontSize: '13px',
            fontFamily: 'monospace',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            color: kindColor,
          }}
        >
          {s.kind}
        </div>
        <div
          style={{
            background: `${provColor}18`,
            border: `1px solid ${provColor}3c`,
            borderRadius: '6px',
            padding: '6px 16px',
            fontSize: '13px',
            fontFamily: 'monospace',
            letterSpacing: '1px',
            textTransform: 'uppercase',
            color: provColor,
          }}
        >
          {provLabel}
        </div>
      </div>

      {/* Title + subtitle */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '820px' }}>
        <div
          style={{
            fontSize: '62px',
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: '-1px',
            color: BONE,
          }}
        >
          {s.title}
        </div>
        <div
          style={{
            fontSize: '24px',
            color: BONE_DIM,
            fontStyle: 'italic',
            lineHeight: 1.4,
          }}
        >
          {s.subtitle}
        </div>
      </div>

      {/* Footer row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* biome-ignore lint/performance/noImgElement: Satori only renders <img> */}
          {/* biome-ignore lint/a11y/useAltText: Satori ignores alt for rasterization */}
          <img src={logoSrc} width={64} height={64} style={{ display: 'flex' }} />
          <div
            style={{
              fontSize: '14px',
              fontFamily: 'monospace',
              letterSpacing: '2px',
              textTransform: 'uppercase',
              color: `${BONE}66`,
            }}
          >
            chainbard
          </div>
        </div>
        <div style={{ fontSize: '12px', fontFamily: 'monospace', color: `${BONE}40` }}>
          {`solana://${decoded.slice(0, 12)}…`}
        </div>
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
