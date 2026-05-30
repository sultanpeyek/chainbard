'use client';

/**
 * JudgeOverlay — a toggleable, public-safe debug overlay for a rendered story
 * (CONTEXT "Judge mode"). A story page opts in by mounting it with the story and
 * its public render metadata; the toggle is OFF by default and enabling it is
 * safe in public.
 *
 * It surfaces ONLY on-chain-public proof + service provenance (ADR 0016 F):
 *   - paymentSig / memoSig as Solscan tx links (settlement proof)
 *   - provenance badge
 *   - render timings
 *   - raw spotlight JSON (the persisted story object the page already renders),
 *     with the image MODEL name stripped
 *
 * HARD EXCLUSION (ADR 0002 / 0016 F): it never receives nor renders DEMO_SECRET,
 * keypairs, _recon, operator strategy, or MODEL NAMES / costs / budget / treasury
 * balance / decision rationale.
 */

import { useState } from 'react';
import { solscanTxUrl } from '@/lib/explorer';
import { truncateId } from '@/lib/truncate-id';

export type JudgeOverlayProps = {
  /** The persisted story object — its own public render metadata (raw JSON). */
  story: Record<string, unknown>;
  provenance: string;
  paymentSig?: string | null;
  memoSig?: string | null;
  /** Render timings in ms, keyed by phase (e.g. { spotlightMs, renderMs }). */
  timings?: Record<string, number>;
  /** Force the panel open at mount — used by tests and explicit opt-in. */
  defaultOpen?: boolean;
};

// Strip the image MODEL name from the dumped story (ADR 0016 F — Judge mode drops
// model names). The per-leg service PROVIDERS (videoProvider/audioProvider) stay:
// they are service provenance, not a model name.
function redactModelNames(story: Record<string, unknown>): Record<string, unknown> {
  const { imageModel: _imageModel, ...rest } = story;
  return rest;
}

function Receipts({
  paymentSig,
  memoSig,
}: {
  paymentSig?: string | null;
  memoSig?: string | null;
}) {
  if (!paymentSig && !memoSig) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="cb-eyebrow">Receipts</span>
      <div className="flex flex-col gap-1 font-mono text-[11px]">
        {paymentSig ? (
          <a
            href={solscanTxUrl(paymentSig)}
            target="_blank"
            rel="noreferrer"
            className="group flex items-center justify-between gap-3 text-bone-dim transition-colors hover:text-amber"
          >
            <span className="uppercase tracking-[0.14em] text-bone-faint">payment</span>
            <span className="truncate">
              {truncateId(paymentSig, 'tx')}
              <span
                aria-hidden
                className="ml-1 inline-block transition-transform group-hover:translate-x-0.5"
              >
                →
              </span>
            </span>
          </a>
        ) : null}
        {memoSig ? (
          <a
            href={solscanTxUrl(memoSig)}
            target="_blank"
            rel="noreferrer"
            className="group flex items-center justify-between gap-3 text-bone-dim transition-colors hover:text-amber"
          >
            <span className="uppercase tracking-[0.14em] text-bone-faint">sap memo</span>
            <span className="truncate">
              {truncateId(memoSig, 'tx')}
              <span
                aria-hidden
                className="ml-1 inline-block transition-transform group-hover:translate-x-0.5"
              >
                →
              </span>
            </span>
          </a>
        ) : null}
      </div>
    </div>
  );
}

export function JudgeOverlay({
  story,
  provenance,
  paymentSig,
  memoSig,
  timings,
  defaultOpen = false,
}: JudgeOverlayProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2 font-mono">
      {open && (
        <section
          aria-label="Judge view"
          className="cb-rise flex max-h-[70vh] w-[min(92vw,24rem)] flex-col gap-4 overflow-auto rounded-[5px] border border-ink-line bg-ink-raised/95 p-5 shadow-[0_0_60px_-20px_rgba(232,161,58,0.35)] backdrop-blur"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-amber">
              <span aria-hidden className="h-1 w-1 rounded-full bg-amber" />
              Judge view ON
            </span>
          </div>

          <dl className="grid gap-px overflow-hidden rounded-[2px] border border-ink-line bg-ink-line text-[11px]">
            <div className="flex items-baseline justify-between gap-4 bg-ink px-3 py-2">
              <dt className="uppercase tracking-[0.14em] text-bone-faint">provenance</dt>
              <dd className="text-bone">{provenance}</dd>
            </div>
            {timings
              ? Object.entries(timings).map(([phase, ms]) => (
                  <div
                    key={phase}
                    className="flex items-baseline justify-between gap-4 bg-ink px-3 py-2"
                  >
                    <dt className="uppercase tracking-[0.14em] text-bone-faint">{phase}</dt>
                    <dd className="text-bone">{ms} ms</dd>
                  </div>
                ))
              : null}
          </dl>

          <Receipts paymentSig={paymentSig} memoSig={memoSig} />

          <div className="flex flex-col gap-1.5">
            <span className="cb-eyebrow">Raw spotlight JSON</span>
            <pre className="overflow-auto rounded-[2px] border border-ink-line bg-ink p-3 text-[10px] leading-relaxed text-bone-dim">
              {JSON.stringify(redactModelNames(story), null, 2)}
            </pre>
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-pressed={open}
        className="inline-flex items-center gap-1.5 rounded-[3px] border border-ink-line bg-ink-raised/80 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-bone-dim backdrop-blur transition-colors hover:border-amber hover:text-amber"
      >
        <span
          aria-hidden
          className="h-1 w-1 rounded-full"
          style={{ backgroundColor: open ? 'var(--amber)' : 'var(--bone-faint)' }}
        />
        {open ? 'Judge view' : 'Judge mode'}
      </button>
    </div>
  );
}
