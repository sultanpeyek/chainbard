import Image from 'next/image';
import { CopyAddress } from '@/components/copy-address';
import { KindBadge } from '@/components/kind-badge';
import { MediaHydrator } from '@/components/media-hydrator';
import { ProvenanceReceipt } from '@/components/provenance-receipt';
import { ShareActions } from '@/components/share-actions';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { SolscanLink } from '@/components/solscan-link';
import { StoryMedia } from '@/components/story-media';
import { shortenIds } from '@/lib/truncate-id';
import type { NftStory } from '@/story-renderer';

const DOT: Record<'mint' | 'buy' | 'transfer' | 'recovery', string> = {
  mint: 'bg-verdant',
  buy: 'bg-bone-faint',
  transfer: 'bg-ember',
  recovery: 'bg-amber',
};

function ImageBadge({ kind }: { kind: 'generated' | 'on-chain' }) {
  const styles =
    kind === 'generated'
      ? 'border-amber/40 bg-ink/80 text-amber'
      : 'border-verdant/40 bg-ink/80 text-verdant';
  const text = kind === 'generated' ? '✦ generated' : '⛓ on-chain asset';
  return (
    <span
      className={`absolute bottom-2 right-2 z-10 rounded-full border px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider backdrop-blur ${styles}`}
    >
      {text}
    </span>
  );
}

function NftArtCard({ story }: { story: NftStory }) {
  const palette: [string, string, string] = ['#2b1810', '#d4a574', '#7c2d12'];
  const [bg, fg, accent] = palette;
  const hasArt = !!story.imageUri && story.imageUri.startsWith('http');
  return (
    <div
      className="relative aspect-square overflow-hidden rounded-[4px] border border-ink-line shadow-[0_0_60px_-20px_rgba(232,161,58,0.25)]"
      style={{ background: bg }}
    >
      {hasArt ? (
        <Image
          src={story.imageUri as string}
          alt={story.name}
          fill
          sizes="(min-width: 768px) 50vw, 100vw"
          className="object-cover"
          priority
          unoptimized
        />
      ) : (
        <svg viewBox="0 0 400 400" className="absolute inset-0 w-full h-full" aria-hidden>
          <defs>
            <pattern id="nft-geo" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
              <path
                d="M20 0 L40 20 L20 40 L0 20 Z"
                fill="none"
                stroke={accent}
                strokeWidth="0.5"
                opacity="0.4"
              />
              <circle cx="20" cy="20" r="1.5" fill={fg} opacity="0.4" />
            </pattern>
            <radialGradient id="nft-glow" cx="50%" cy="40%" r="60%">
              <stop offset="0%" stopColor={fg} stopOpacity="0.25" />
              <stop offset="100%" stopColor={bg} stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="400" height="400" fill="url(#nft-geo)" />
          <rect width="400" height="400" fill="url(#nft-glow)" />
          <g transform="translate(200 200)">
            <circle r="90" fill="none" stroke={fg} strokeWidth="2" opacity="0.7" />
            <circle r="60" fill={accent} opacity="0.85" />
            <path d="M-40 -10 L40 -10 L25 25 L-25 25 Z" fill={bg} />
            <path
              d="M-30 -10 L-12 8 M30 -10 L12 8 M-8 12 L8 12"
              stroke={fg}
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path d="M-90 90 L0 50 L90 90 L0 130 Z" fill={fg} opacity="0.95" />
          </g>
        </svg>
      )}
      <ImageBadge kind="on-chain" />
      <div className="absolute bottom-0 inset-x-0 p-4 bg-linear-to-t from-ink/90 to-transparent">
        <div className="cb-display wrap-break-word text-bone text-xl">
          {shortenIds(story.title)}
        </div>
      </div>
    </div>
  );
}

function StoryBanner({ storyImageUrl }: { storyImageUrl: string }) {
  const palette: [string, string, string] = ['#2b1810', '#d4a574', '#f4ecd6'];
  const [bg, ink, paper] = palette;
  const hasImage = storyImageUrl.startsWith('http');
  return (
    <div
      className="relative overflow-hidden h-72 rounded-[4px] border border-ink-line"
      style={{ background: `linear-gradient(180deg, ${bg} 0%, #000 100%)` }}
    >
      {hasImage ? (
        <Image
          src={storyImageUrl}
          alt="generated story image"
          fill
          sizes="(min-width: 768px) 768px, 100vw"
          className="object-cover"
          unoptimized
        />
      ) : (
        <svg
          viewBox="0 0 800 400"
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 h-full w-full"
          aria-hidden
        >
          <defs>
            <pattern
              id="banner-geo"
              x="0"
              y="0"
              width="80"
              height="80"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M40 0 L80 40 L40 80 L0 40 Z M40 20 L60 40 L40 60 L20 40 Z"
                fill="none"
                stroke={ink}
                strokeWidth="0.6"
                opacity="0.35"
              />
            </pattern>
            <linearGradient id="banner-horizon" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={paper} stopOpacity="0" />
              <stop offset="100%" stopColor={paper} stopOpacity="0.25" />
            </linearGradient>
          </defs>
          <rect width="800" height="400" fill={`url(#banner-geo)`} />
          <rect width="800" height="400" fill={`url(#banner-horizon)`} />
          <g transform="translate(400 320)">
            <path
              d="M-150 0 L-150 -150 A 150 150 0 0 1 150 -150 L 150 0 Z"
              fill="#000"
              opacity="0.55"
            />
            <path
              d="M-125 -8 L-125 -130 A 125 125 0 0 1 125 -130 L 125 -8 Z"
              fill="none"
              stroke={paper}
              strokeWidth="1"
              opacity="0.55"
            />
            <path d="M-95 -8 L-95 -110 A 95 95 0 0 1 95 -110 L 95 -8 Z" fill={bg} opacity="0.85" />
          </g>
          <text
            x="50%"
            y="55%"
            textAnchor="middle"
            fontFamily="serif"
            fontSize="56"
            fill={paper}
            opacity="0.85"
            style={{ fontStyle: 'italic' }}
          >
            saga
          </text>
        </svg>
      )}
      <ImageBadge kind="generated" />
    </div>
  );
}

export function NftSharePage({
  story,
  provenance = 'curator',
  memoSig,
  paymentSig,
}: {
  story: NftStory;
  provenance?: string;
  memoSig?: string | null;
  paymentSig?: string | null;
}) {
  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <SiteHeader active="activity" />

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 sm:px-8 py-12">
        <section className="grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
          <NftArtCard story={story} />

          <div className="cb-rise min-w-0">
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <KindBadge kind="nft" />
              <span className="rounded-[2px] border border-ink-line px-2 py-0.5 font-mono uppercase tracking-wider text-bone-dim">
                tone · {story.tone}
              </span>
            </div>

            <h1 className="cb-display mt-4 wrap-break-word text-4xl sm:text-5xl tracking-tight text-bone">
              {shortenIds(story.title)}
            </h1>
            <p className="mt-2 wrap-break-word italic text-bone-dim text-lg">
              {shortenIds(story.subtitle)}
            </p>

            <div className="mt-5 min-w-0 text-sm">
              <span className="cb-eyebrow text-bone-faint">Mint</span>
              <CopyAddress value={story.input} className="mt-1 text-bone-dim" />
              <div className="mt-2">
                <SolscanLink value={story.input} kind="nft" />
              </div>
            </div>

            {story.collectionName && (
              <div className="mt-6">
                <div className="font-mono text-[10px] uppercase tracking-wider text-bone-faint">
                  Collection
                </div>
                <div className="wrap-break-word text-lg font-medium text-bone">
                  {shortenIds(story.collectionName)}
                </div>
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-3">
              {story.traits.map((t) => (
                <div
                  key={t.label}
                  className="min-w-0 rounded-[4px] border border-ink-line bg-ink-raised/40 p-3 backdrop-blur"
                >
                  <div className="wrap-break-word text-[10px] uppercase tracking-wider text-bone-faint">
                    {shortenIds(t.label)}
                  </div>
                  <div className="wrap-break-word text-sm font-medium text-bone">
                    {shortenIds(t.value)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-3xl pt-16">
          <h2 className="cb-display text-3xl text-bone">Provenance</h2>
          <p className="mt-1 text-sm text-bone-faint">Every hand this NFT has passed through.</p>
        </section>

        <section className="mx-auto max-w-3xl pt-6">
          <ol className="space-y-0">
            {story.provenance.map((p, i) => (
              <li key={`${p.short}-${p.acquired}-${i}`} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={`h-3 w-3 rounded-full ${DOT[p.acquired]} ring-4 ring-ink`} />
                  {i < story.provenance.length - 1 && (
                    <div className="flex-1 w-px bg-ink-line mt-1" />
                  )}
                </div>
                <div className="min-w-0 flex-1 pb-6">
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="wrap-break-word font-mono text-sm font-semibold text-bone">
                      {shortenIds(p.short)}
                    </span>
                    <span className="text-xs text-bone-faint">held {p.duration}</span>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-bone-faint">
                      {p.acquired}
                    </span>
                    {p.price && (
                      <span className="ml-auto font-mono text-sm text-bone-dim">{p.price}</span>
                    )}
                  </div>
                  <div className="wrap-break-word text-sm text-bone-dim mt-1">
                    {shortenIds(p.note)}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-3xl pt-6">
          <blockquote className="border-l-2 border-amber pl-6 wrap-break-word italic text-lg text-bone-dim">
            {shortenIds(story.drama)}
          </blockquote>
        </section>

        <section className="mx-auto max-w-3xl pt-16">
          <div className="flex items-center justify-between mb-3">
            <h2 className="cb-display text-2xl text-bone">Story image</h2>
            <span className="text-[11px] font-mono uppercase tracking-wider text-bone-faint">
              content-policy-compliant · echoes the saga, not the asset
            </span>
          </div>
          <StoryBanner storyImageUrl={story.storyImageUrl} />
          <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
            <p className="text-[11px] font-mono text-bone-faint">
              rendered via Ace · prompted from on-chain signals
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-3xl pt-16">
          <div className="cb-rule mb-6" />
          <p className="cb-eyebrow text-bone-faint">Verdict</p>
          <p className="mt-2 wrap-break-word text-xl text-bone">{shortenIds(story.verdict)}</p>
        </section>

        {/* Reactive media (video/audio), late-hydrated once the attach job lands */}
        <StoryMedia videoUrl={story.videoUrl} audioUrl={story.audioUrl} />
        <MediaHydrator hasMedia={Boolean(story.videoUrl || story.audioUrl)} />

        <section className="mx-auto max-w-3xl pt-12">
          <ProvenanceReceipt
            input={story.input}
            kind="nft"
            provenance={provenance}
            memoSig={memoSig}
            paymentSig={paymentSig}
          />
        </section>

        <div className="mx-auto max-w-3xl pt-12">
          <div className="cb-rule mb-8" />
          <div className="flex flex-wrap gap-2 justify-center">
            <ShareActions title={story.title} variant="nft" />
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
