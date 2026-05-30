import Image from 'next/image';
import { AiDisclaimer } from '@/components/ai-disclaimer';
import { CopyAddress } from '@/components/copy-address';
import { HeroFallback, isRealHeroImage } from '@/components/hero-fallback';
import { KindBadge } from '@/components/kind-badge';
import { MediaHydrator } from '@/components/media-hydrator';
import { ProvenanceReceipt } from '@/components/provenance-receipt';
import { ShareActions } from '@/components/share-actions';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { SolscanLink } from '@/components/solscan-link';
import { StoryMedia } from '@/components/story-media';
import { shortenIds } from '@/lib/truncate-id';
import type { TokenStory } from '@/story-renderer';

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

function StatMeter({ label, value }: { label: string; value: string }) {
  return (
    <div className="-mr-px -mb-px min-w-0 border-r border-b border-ink-line p-4">
      <div className="truncate text-[10px] uppercase tracking-wider text-bone-faint">{label}</div>
      <div className="mt-1 wrap-break-word font-mono text-xl text-bone">{shortenIds(value)}</div>
    </div>
  );
}

// Web-sourced origin/lineage (ADR 0014 Tier-2). Rendered ONLY when the second
// SERP call surfaced something — founder, first-mint claim, or crucial events —
// and always badged "reported · unverified": none of it is on-chain truth.
function OriginLineage({ origin }: { origin: NonNullable<TokenStory['origin']> }) {
  const { founder, firstMint, keyEvents } = origin;
  return (
    <section className="mx-auto max-w-3xl pt-16">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="cb-display text-2xl text-bone">Origins &amp; lineage</h2>
        <span className="rounded-full border border-ink-line px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-bone-faint">
          reported · unverified
        </span>
      </div>
      <div className="space-y-4 rounded-[4px] border border-ink-line bg-ink-raised/30 p-5">
        {(founder || firstMint) && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {founder && (
              <div className="min-w-0">
                <p className="cb-eyebrow text-bone-faint">Reported founder</p>
                <p className="mt-1 wrap-break-word text-bone-dim">{shortenIds(founder)}</p>
              </div>
            )}
            {firstMint && (
              <div className="min-w-0">
                <p className="cb-eyebrow text-bone-faint">First appeared</p>
                <p className="mt-1 wrap-break-word text-bone-dim">{shortenIds(firstMint)}</p>
              </div>
            )}
          </div>
        )}
        {keyEvents.length > 0 && (
          <div className="min-w-0">
            <p className="cb-eyebrow text-bone-faint">Crucial events</p>
            <ol className="mt-3 space-y-3">
              {keyEvents.map((e, i) => (
                <li key={`${e.when}-${i}`} className="grid grid-cols-[auto_1fr] gap-4">
                  <span className="whitespace-nowrap font-mono text-xs text-amber">
                    {shortenIds(e.when) || '—'}
                  </span>
                  <span className="min-w-0 wrap-break-word text-bone-dim">
                    {shortenIds(e.what)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
      <p className="mt-2 text-[11px] font-mono text-bone-faint">
        web-sourced narrative · not on-chain fact · verify before relying
      </p>
    </section>
  );
}

function hasOrigin(origin: TokenStory['origin']): origin is NonNullable<TokenStory['origin']> {
  return !!origin && (!!origin.founder || !!origin.firstMint || origin.keyEvents.length > 0);
}

function TokenArtCard({ story }: { story: TokenStory }) {
  const palette: [string, string, string] = ['#2b1810', '#d4a574', '#7c2d12'];
  const [bg, fg, accent] = palette;
  // imageUri is typed string|null, but pre-redesign token rows are read from the repo
  // via a cast (no zod re-parse), so it can be undefined at runtime — guard for it.
  const hasArt = !!story.imageUri && story.imageUri.startsWith('http');
  return (
    <div
      className="relative aspect-square overflow-hidden rounded-[4px] border border-ink-line shadow-[0_0_60px_-20px_rgba(232,161,58,0.25)]"
      style={{ background: bg }}
    >
      {hasArt ? (
        <Image
          src={story.imageUri as string}
          alt={shortenIds(story.title)}
          fill
          sizes="(min-width: 768px) 50vw, 100vw"
          className="object-contain p-6"
          priority
          unoptimized
        />
      ) : (
        <svg viewBox="0 0 400 400" className="absolute inset-0 w-full h-full" aria-hidden>
          <defs>
            <pattern
              id="token-geo"
              x="0"
              y="0"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M20 0 L40 20 L20 40 L0 20 Z"
                fill="none"
                stroke={accent}
                strokeWidth="0.5"
                opacity="0.4"
              />
              <circle cx="20" cy="20" r="1.5" fill={fg} opacity="0.4" />
            </pattern>
            <radialGradient id="token-glow" cx="50%" cy="40%" r="60%">
              <stop offset="0%" stopColor={fg} stopOpacity="0.25" />
              <stop offset="100%" stopColor={bg} stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="400" height="400" fill="url(#token-geo)" />
          <rect width="400" height="400" fill="url(#token-glow)" />
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
      {hasArt && <ImageBadge kind="on-chain" />}
      <div className="absolute bottom-0 inset-x-0 p-4 bg-linear-to-t from-ink/90 to-transparent">
        <div className="cb-display wrap-break-word text-bone text-xl">
          {shortenIds(story.title)}
        </div>
      </div>
    </div>
  );
}

export function TokenSharePage({
  story,
  provenance,
  memoSig,
  paymentSig,
  brief,
}: {
  story: TokenStory;
  provenance: string;
  memoSig?: string | null;
  paymentSig?: string | null;
  /** Buyer brief that steered this render. Surfaced only for buyer provenance
   * (ADR 0016 F — no curator reasoning on the public page). */
  brief?: string | null;
}) {
  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <SiteHeader active="activity" />

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 sm:px-8 py-12">
        <section className="grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
          <TokenArtCard story={story} />

          <div className="cb-rise min-w-0">
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <KindBadge kind="token" />
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
                <SolscanLink value={story.input} kind="token" />
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 overflow-hidden rounded-[4px] border border-ink-line">
              {story.stats.map((s) => (
                <StatMeter key={s.label} label={s.label} value={s.value} />
              ))}
            </div>
          </div>
        </section>

        {hasOrigin(story.origin) && <OriginLineage origin={story.origin} />}

        <div className="mx-auto max-w-3xl pt-16 space-y-20">
          {story.sections.map((s, i) => (
            <section
              key={s.title}
              className="grid grid-cols-1 items-start gap-6 sm:grid-cols-[auto_1fr] sm:gap-10"
            >
              <div className="font-mono text-sm text-amber sm:w-20 sm:text-right">
                {String(i + 1).padStart(2, '0')}
              </div>
              <div className="min-w-0">
                <h2 className="cb-display wrap-break-word text-3xl text-bone">
                  {shortenIds(s.title)}
                </h2>
                <div className="mt-2 h-px w-12 bg-amber/60" />
                <p className="mt-5 wrap-break-word text-lg leading-relaxed text-bone-dim">
                  {shortenIds(s.body)}
                </p>
              </div>
            </section>
          ))}
        </div>

        <section className="mx-auto max-w-3xl pt-16">
          <div className="flex items-center justify-between mb-3">
            <h2 className="cb-display text-2xl text-bone">Generated infographic</h2>
            <span className="text-[11px] font-mono uppercase tracking-wider text-bone-faint">
              echoes the data, not the art · facts embedded verbatim
            </span>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-[4px] border border-ink-line bg-ink">
            {isRealHeroImage(story.heroImageUrl) ? (
              <Image
                src={story.heroImageUrl}
                alt="generated token infographic"
                fill
                sizes="(min-width: 768px) 768px, 100vw"
                className="object-contain"
                unoptimized
              />
            ) : (
              <HeroFallback label="Token data infographic" />
            )}
            <ImageBadge kind="generated" />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
            <p className="text-[11px] font-mono text-bone-faint">
              rendered via Ace · prompted from on-chain signals
            </p>
          </div>
        </section>

        <StoryMedia videoUrl={story.videoUrl} audioUrl={story.audioUrl} />
        <MediaHydrator hasMedia={Boolean(story.videoUrl || story.audioUrl)} />

        <section className="mx-auto max-w-3xl pt-16">
          <div className="cb-rule mb-6" />
          <p className="cb-eyebrow text-bone-faint">Verdict</p>
          <p className="mt-2 wrap-break-word text-xl text-bone">{shortenIds(story.verdict)}</p>
        </section>

        {provenance === 'buyer' && brief?.trim() && (
          <section className="mx-auto max-w-3xl pt-12">
            <div className="rounded-[3px] border border-ink-line bg-ink-raised/40 p-5">
              <p className="cb-eyebrow text-bone-faint">Buyer&rsquo;s brief</p>
              <p className="mt-2 wrap-break-word font-mono text-sm italic leading-relaxed text-bone-dim">
                {brief}
              </p>
            </div>
          </section>
        )}

        <div className="mx-auto max-w-3xl pt-12">
          <AiDisclaimer />
        </div>

        <section className="mx-auto max-w-3xl pt-12">
          <ProvenanceReceipt
            input={story.input}
            kind="token"
            provenance={provenance}
            memoSig={memoSig}
            paymentSig={paymentSig}
          />
        </section>

        <div className="mx-auto max-w-3xl pt-12 pb-4 text-center font-mono text-xs text-bone-faint">
          chainbard · token bio · <CopyAddress value={story.input} className="text-bone-faint" />
        </div>

        <div className="mx-auto max-w-3xl pt-4">
          <div className="cb-rule mb-8" />
          <div className="flex flex-wrap gap-2 justify-center">
            <ShareActions title={story.title} variant="token" />
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
