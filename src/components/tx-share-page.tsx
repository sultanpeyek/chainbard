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
import { shortenIds, truncateId } from '@/lib/truncate-id';
import type { TxStory } from '@/story-renderer';

// ── Forensic dashboard template ───────────────────────────────────────────────

function programName(programId: string, labels: TxStory['programLabels']): string {
  return labels.find((l) => l.programId === programId)?.name ?? programId.slice(0, 8);
}

const PROGRAM_TINTS = [
  '#a78bfa',
  '#fbbf24',
  '#22d3ee',
  '#34d399',
  '#f472b6',
  '#cbd5e1',
  '#a3e635',
  '#fb7185',
  '#60a5fa',
  '#f97316',
];

function tintFor(programId: string, labels: TxStory['programLabels']): string {
  const idx = labels.findIndex((l) => l.programId === programId);
  return PROGRAM_TINTS[idx % PROGRAM_TINTS.length] ?? '#888';
}

function Meter({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-r border-b border-ink-line -mr-px -mb-px p-4">
      <div className="cb-eyebrow text-bone-faint">{label}</div>
      <div className="mt-1 cb-display wrap-break-word text-xl text-bone">{shortenIds(value)}</div>
    </div>
  );
}

function formatSol(lamports: number): string {
  return `${(lamports / 1e9).toFixed(4)} SOL`;
}

function formatBlockTime(ts: number | null): string {
  if (!ts) return 'unknown';
  return new Date(ts * 1000).toUTCString().replace('GMT', 'UTC');
}

export function TxSharePage({
  story,
  provenance = 'curator',
  memoSig,
  paymentSig,
}: {
  story: TxStory;
  provenance?: string;
  memoSig?: string | null;
  paymentSig?: string | null;
}) {
  const uniquePrograms = story.programLabels;
  const instructionCount = story.ixProgramIds.length;

  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <SiteHeader active="activity" />

      {/* Input bar */}
      <div className="sticky top-0 z-30 w-full border-b border-ink-line bg-ink/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-2 px-5 py-3 sm:px-8">
          <span className="font-mono text-xs text-amber/70">solana://tx/</span>
          <span className="flex-1 truncate">
            <CopyAddress value={story.input} kind="tx" className="text-sm text-bone-dim" />
          </span>
          <span className="shrink-0 font-mono text-xs text-bone-faint">
            slot {story.slot.toLocaleString()}
          </span>
        </div>
      </div>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-12 sm:px-8">
        {/* Header */}
        <section className="cb-rise">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <KindBadge kind="tx" />
            <span className="cb-eyebrow rounded-[2px] border border-ink-line px-2 py-0.5 text-bone-dim">
              tone · {story.tone}
            </span>
          </div>

          <h1 className="mt-4 cb-display wrap-break-word text-4xl tracking-tight text-bone sm:text-5xl">
            {shortenIds(story.title)}
          </h1>
          <p className="mt-3 max-w-2xl wrap-break-word text-lg italic text-bone-dim">
            {shortenIds(story.subtitle)}
          </p>

          {/* Block-context chips */}
          <div className="mt-8 flex flex-wrap gap-2 font-mono text-xs">
            <span className="rounded-[2px] border border-ink-line px-2 py-1">
              <span className="text-bone-faint">time </span>
              <span className="text-bone">{formatBlockTime(story.blockTime)}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-[2px] border border-ink-line px-2 py-1">
              <span className="text-bone-faint">signer</span>
              <CopyAddress
                value={story.signer ?? story.signerShort}
                label={story.signerShort}
                className="text-bone"
              />
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-[2px] border border-ink-line px-2 py-1">
              <span className="text-bone-faint">sig</span>
              <CopyAddress value={story.input} kind="tx" className="text-bone" />
            </span>
            <SolscanLink value={story.input} kind="tx" />
          </div>

          {/* Hero image */}
          <div className="relative mt-8 h-64 overflow-hidden rounded-[4px] border border-ink-line bg-ink-raised sm:h-80">
            <TxHeroImage story={story} />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
            <p className="font-mono text-[11px] text-bone-faint">
              content-policy-compliant story image · rendered via Ace
            </p>
          </div>
        </section>

        {/* Fee / CU meters */}
        <section className="mt-10">
          <div className="grid grid-cols-2 overflow-hidden rounded-[4px] border border-ink-line sm:grid-cols-4">
            <Meter label="Fee" value={formatSol(story.feeLamports)} />
            <Meter
              label="Compute units"
              value={
                story.computeUnitsConsumed !== null
                  ? story.computeUnitsConsumed.toLocaleString()
                  : 'n/a'
              }
            />
            <Meter label="Programs" value={String(uniquePrograms.length)} />
            <Meter label="Instructions" value={String(instructionCount)} />
          </div>
        </section>

        {/* Programs legend */}
        <section className="mt-10">
          <h2 className="cb-eyebrow text-bone-faint">Programs touched</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {uniquePrograms.map((p, i) => (
              <div
                key={p.programId}
                className="flex items-center gap-2 rounded-[2px] border border-ink-line px-3 py-1.5 text-sm"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: PROGRAM_TINTS[i % PROGRAM_TINTS.length] }}
                />
                <span className="font-medium text-bone">{p.name}</span>
                <span className="font-mono text-xs text-bone-faint">×{p.calls}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Web context (SERP) */}
        {story.serpSnippets.length > 0 && (
          <section className="mt-10">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="cb-eyebrow text-bone-faint">Web context</h2>
              <span className="font-mono text-[11px] text-amber/70">
                via SERP · {story.serpSnippets.length} snippet
                {story.serpSnippets.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="mt-3 overflow-hidden rounded-[4px] border border-ink-line">
              {story.serpSnippets.map((snippet, i) => (
                <div
                  key={`serp-${i}-${snippet.slice(0, 24)}`}
                  className="grid grid-cols-[2.5rem_1fr] items-start gap-3 border-b border-ink-line px-3 py-3 last:border-0"
                >
                  <span className="pt-0.5 text-right font-mono text-xs text-amber/60">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <p className="min-w-0 wrap-break-word text-sm leading-relaxed text-bone-dim">
                    {snippet}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Instruction stack */}
        <section className="mt-10">
          <h2 className="cb-eyebrow text-bone-faint">Instruction stack</h2>
          <div className="mt-3 overflow-hidden rounded-[4px] border border-ink-line">
            {story.ixProgramIds.map((programId, i) => {
              const reverted = story.revertedInstructionIndices.includes(i);
              const name = programName(programId, story.programLabels);
              const tint = tintFor(programId, story.programLabels);
              return (
                <div
                  key={`ix-${i}-${programId}`}
                  className={`grid grid-cols-[2.5rem_0.5rem_8rem_1fr] items-center gap-3 border-b border-ink-line px-3 py-2 text-sm last:border-0 ${
                    reverted ? 'bg-ember/5' : ''
                  }`}
                >
                  <span className="text-right font-mono text-xs text-bone-faint">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="h-2 w-2 rounded-full" style={{ background: tint }} />
                  <span className="min-w-0 wrap-break-word font-medium text-bone">{name}</span>
                  <span
                    className={`font-mono text-xs ${reverted ? 'text-ember line-through' : 'text-bone-dim'}`}
                  >
                    {reverted ? 'reverted' : `ix ${i + 1}`}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Balance-delta table */}
        <section className="mt-10">
          <h2 className="cb-eyebrow text-bone-faint">Balance deltas</h2>
          <div className="mt-3 overflow-hidden rounded-[4px] border border-ink-line">
            <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-4 border-b border-ink-line px-4 py-2 cb-eyebrow text-bone-faint">
              <span>Account</span>
              <span>Before</span>
              <span>After</span>
              <span>Δ</span>
            </div>
            {story.balanceDeltas.map((d, i) => {
              const delta = d.postLamports - d.preLamports;
              const positive = delta > 0;
              return (
                <div
                  key={`delta-${d.pubkey}-${i}`}
                  className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-4 border-b border-ink-line px-4 py-3 text-sm last:border-0"
                >
                  <span className="min-w-0 truncate">
                    <CopyAddress value={d.pubkey} className="text-bone" />
                  </span>
                  <span className="font-mono text-bone-dim">{formatSol(d.preLamports)}</span>
                  <span className="font-mono text-bone-dim">{formatSol(d.postLamports)}</span>
                  <span className={`font-mono ${positive ? 'text-verdant' : 'text-ember'}`}>
                    {positive ? '+' : ''}
                    {formatSol(delta)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Hinge callout */}
        <section className="mx-auto mt-10 max-w-3xl">
          <div className="rounded-[4px] border border-ember/40 bg-ember/5 p-5">
            <p className="cb-eyebrow text-ember">The hinge</p>
            <p className="mt-2 wrap-break-word text-base leading-relaxed text-bone">
              {shortenIds(story.hinge)}
            </p>
          </div>
        </section>

        {/* Narrative */}
        <section className="mx-auto mt-10 max-w-3xl">
          <p className="wrap-break-word text-lg leading-relaxed text-bone-dim">
            {shortenIds(story.narrative)}
          </p>
        </section>

        {/* Verdict */}
        <section className="mx-auto mt-10 max-w-3xl border-l-2 border-amber/60 pl-6">
          <p className="cb-eyebrow text-amber">Verdict</p>
          <p className="mt-2 cb-display wrap-break-word text-xl text-bone">
            {shortenIds(story.verdict)}
          </p>
        </section>

        {/* Reactive media (video/audio), late-hydrated once the attach job lands */}
        <StoryMedia videoUrl={story.videoUrl} audioUrl={story.audioUrl} />
        <MediaHydrator hasMedia={Boolean(story.videoUrl || story.audioUrl)} />

        {/* AI disclaimer */}
        <div className="mx-auto mt-12 max-w-3xl">
          <AiDisclaimer />
        </div>

        {/* Mint seal */}
        <div className="mx-auto mt-8 max-w-3xl">
          <ProvenanceReceipt
            input={story.input}
            kind="tx"
            provenance={provenance}
            memoSig={memoSig}
            paymentSig={paymentSig}
          />
        </div>

        {/* Share row */}
        <div className="mt-12 border-t border-ink-line pt-8">
          <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-2">
            <ShareActions title={story.title} variant="tx" />
          </div>
        </div>

        <div className="mt-12 text-center font-mono text-xs text-bone-faint">
          chainbard · tx forensic · {truncateId(story.input, 'tx')}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

// Inline SVG hero (shown when the image URL is the fixture placeholder or fails)
function TxHeroImage({ story }: { story: TxStory }) {
  if (!isRealHeroImage(story.heroImageUrl)) {
    return <HeroFallback label="Abstract transaction visualization" />;
  }
  return (
    // biome-ignore lint/performance/noImgElement: heroImageUrl is dynamic; next/image requires domain config
    <img
      src={story.heroImageUrl}
      alt="tx story hero"
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}
