import { AiDisclaimer } from '@/components/ai-disclaimer';
import { CopyAddress } from '@/components/copy-address';
import { HeroFallback, isRealHeroImage } from '@/components/hero-fallback';
import { MediaHydrator } from '@/components/media-hydrator';
import { ProvenanceReceipt } from '@/components/provenance-receipt';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { SolscanLink } from '@/components/solscan-link';
import { StoryMedia } from '@/components/story-media';
import { shortenIds } from '@/lib/truncate-id';
import type { WalletStory } from '@/story-renderer';

function ProvenanceBadge({ provenance }: { provenance: string }) {
  const label =
    provenance === 'seed' ? 'curator seed' : provenance === 'buyer' ? 'buyer render' : 'curator';
  const color =
    provenance === 'seed'
      ? 'border-amber/40 text-amber'
      : provenance === 'buyer'
        ? 'border-verdant/40 text-verdant'
        : 'border-ink-line text-bone-dim';
  return (
    <span
      className={`rounded-[2px] border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${color}`}
    >
      {label}
    </span>
  );
}

function HeroImage({ src }: { src?: string }) {
  if (isRealHeroImage(src)) {
    return (
      // biome-ignore lint/performance/noImgElement: heroImageUrl is dynamic; next/image requires domain config
      <img
        src={src}
        alt="wallet story hero"
        className="absolute inset-0 h-full w-full object-cover"
      />
    );
  }
  return <HeroFallback label="Abstract wallet visualization" />;
}

function StatMeter({ label, value }: { label: string; value: string }) {
  return (
    <div className="-mr-px -mb-px min-w-0 border-r border-b border-ink-line p-4">
      <div className="truncate text-[10px] uppercase tracking-wider text-bone-faint">{label}</div>
      <div className="mt-1 wrap-break-word font-mono text-xl text-bone">{shortenIds(value)}</div>
    </div>
  );
}

export function WalletSharePage({
  story,
  provenance,
  memoSig,
  paymentSig,
  brief,
}: {
  story: WalletStory;
  provenance: string;
  memoSig?: string | null;
  paymentSig?: string | null;
  /** Buyer brief that steered this render. Surfaced only for buyer provenance
   * (ADR 0016 F — no curator reasoning on the public page). */
  brief?: string | null;
}) {
  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 sm:px-8 py-12">
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-amber/70">solana://</span>
          <CopyAddress value={story.input} className="flex-1 text-bone-dim" />
          <SolscanLink value={story.input} kind="wallet" />
          <ProvenanceBadge provenance={provenance} />
        </div>

        <div className="cb-rule my-6" />

        <section className="cb-rise relative overflow-hidden rounded-[4px] border border-ink-line shadow-[0_0_60px_-20px_rgba(232,161,58,0.25)]">
          <div className="relative h-[60vh] min-h-96 w-full">
            <HeroImage src={story.heroImageUrl} />
            <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-ink/40 via-transparent to-ink" />
            <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
              <div className="flex items-center gap-2 text-xs">
                <span className="cb-eyebrow rounded-[2px] border border-ink-line bg-ink-raised/40 px-2 py-0.5 text-bone-dim backdrop-blur">
                  wallet
                </span>
                <span className="cb-eyebrow rounded-[2px] border border-amber/40 px-2 py-0.5 text-amber">
                  tone · {story.tone}
                </span>
              </div>
              <h1 className="cb-display mt-4 wrap-break-word text-5xl leading-none tracking-tight text-bone sm:text-6xl">
                {shortenIds(story.title)}
              </h1>
              <p className="mt-3 max-w-xl wrap-break-word text-xl italic text-bone-dim">
                {shortenIds(story.subtitle)}
              </p>
            </div>
          </div>
        </section>

        <div className="mt-8 grid grid-cols-2 overflow-hidden rounded-[4px] border border-ink-line sm:grid-cols-4">
          {story.stats.map((s) => (
            <StatMeter key={s.label} label={s.label} value={s.value} />
          ))}
        </div>

        <div className="mt-16 space-y-20">
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

          <section className="border-l-2 border-amber pl-4">
            <p className="cb-eyebrow text-amber">Verdict</p>
            <p className="mt-2 wrap-break-word text-xl text-bone">{shortenIds(story.verdict)}</p>
          </section>

          {provenance === 'buyer' && brief?.trim() && (
            <section className="rounded-[3px] border border-ink-line bg-ink-raised/40 p-5">
              <p className="cb-eyebrow text-bone-faint">Buyer&rsquo;s brief</p>
              <p className="mt-2 wrap-break-word font-mono text-sm italic leading-relaxed text-bone-dim">
                {brief}
              </p>
            </section>
          )}
        </div>

        <StoryMedia videoUrl={story.videoUrl} audioUrl={story.audioUrl} />
        <MediaHydrator hasMedia={Boolean(story.videoUrl || story.audioUrl)} />
      </main>

      <div className="mx-auto w-full max-w-3xl px-5 pb-8 sm:px-8">
        <AiDisclaimer />
      </div>

      <div className="mx-auto w-full max-w-3xl px-5 pb-12 sm:px-8">
        <ProvenanceReceipt
          input={story.input}
          kind="wallet"
          provenance={provenance}
          memoSig={memoSig}
          paymentSig={paymentSig}
        />
      </div>

      <div className="pb-12 text-center font-mono text-xs text-bone-faint">
        chainbard · wallet bio · <CopyAddress value={story.input} className="text-bone-faint" />
      </div>

      <SiteFooter />
    </div>
  );
}
