'use client';

import { useEffect, useState } from 'react';
import type { MintError, MintState, MintStep, StepId } from '@/hooks/use-mint';

const STEP_LABELS: Record<StepId, string> = {
  build: 'Build USDC payment',
  'dry-run': 'Dry-run the transfer',
  sign: 'Approve in wallet',
  verify: 'Verify payment',
  settle: 'Settle on-chain',
  confirm: 'Confirm on-chain',
  direct: 'Read the brief',
  facts: 'Gather on-chain facts',
  search: 'Search the web',
  write: 'Write your story',
  paint: 'Generate image',
  save: 'Save',
  memo: 'Stamp receipt on-chain',
};

const MINT_ERROR_COPY: Record<string, string> = {
  rejected: 'Signature declined in your wallet. Approve it to mint.',
  'insufficient-usdc': 'Not enough USDC. The mint costs 0.30 USDC on mainnet.',
  'blockhash-expired': 'The transaction expired before settling. Try again.',
  'facilitator-refundable': 'Payment sent but the render failed — it is refundable. Resume.',
  generic: 'Something went wrong. Try again.',
};

// Reassurance sub-lines for steps whose wait can run long; shown only past the
// elapsed threshold so fast steps never flash them.
const STEP_SUBTEXT: Partial<Record<StepId, string>> = {
  confirm: 'Waiting for network confirmation — can take up to ~45s',
  settle: 'Broadcasting to the network…',
};

// Seconds a step must stay active before its counter + subtext appear.
const SLOW_STEP_THRESHOLD = 3;

// Canonical step order with the conditional steps (direct, search) excluded, so
// the "Next:" caption can only under-promise — never name a step that may skip.
const STEP_ORDER: StepId[] = [
  'build',
  'dry-run',
  'sign',
  'verify',
  'settle',
  'confirm',
  'facts',
  'write',
  'paint',
  'save',
  'memo',
];

// The next always-present step after the furthest-progressed one in `steps`, or
// null if none remains. Used for the dim "Next: …" caption.
function computeNextStep(steps: MintStep[]): StepId | null {
  let furthest = -1;
  for (const step of steps) {
    const idx = STEP_ORDER.indexOf(step.id);
    if (idx > furthest) furthest = idx;
  }
  for (let i = furthest + 1; i < STEP_ORDER.length; i++) {
    const id = STEP_ORDER[i];
    if (!steps.some((s) => s.id === id && s.status === 'done')) return id;
  }
  return null;
}

const STATUS_GLYPH: Record<MintStep['status'], string> = {
  done: '✓',
  pending: '○',
  error: '✗',
  active: '',
};

function SolscanLink({ sig }: { sig: string }) {
  return (
    <a
      href={`https://solscan.io/tx/${sig}`}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-[11px] tracking-tight text-amber underline-offset-4 hover:underline"
    >
      ↗
    </a>
  );
}

const ROW_TONE: Record<MintStep['status'], string> = {
  active: 'text-sm text-bone',
  done: 'text-xs text-bone-dim',
  pending: 'text-xs text-bone-faint/50',
  error: 'text-xs text-ember',
};

// Elapsed seconds since this row mounted. The hook is only ever rendered inside
// an always-active row, so it starts ticking from 0 on mount and clears on
// unmount. Per-row independence comes from React keys (`key={step.id}` for steps,
// `key="__gap"` for the synthetic gap row): a fresh key remounts a fresh 0,
// instead of an `active` dep that could restart the interval mid-step.
function useElapsedSeconds(): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return elapsed;
}

// Shared active-row body: amber spinner, label, optional elapsed counter +
// reassurance sub-line once past the threshold. Used by both StepRow (active)
// and the synthetic gap row.
function ActiveRow({ label, subtext, tone }: { label: string; subtext?: string; tone: string }) {
  const elapsed = useElapsedSeconds();
  const slow = elapsed >= SLOW_STEP_THRESHOLD;
  return (
    <li className={`flex flex-col gap-1 font-mono tracking-tight transition-colors ${tone}`}>
      <div className="flex items-center gap-2">
        <span className="inline-flex w-4 justify-center" aria-hidden>
          <span className="h-3 w-3 animate-spin rounded-full border border-amber border-t-transparent" />
        </span>
        <span>{label}</span>
        {slow && (
          <span aria-hidden className="ml-auto text-[11px] text-bone-faint">
            {elapsed}s
          </span>
        )}
      </div>
      {slow && subtext && (
        <span className="pl-6 font-mono text-[11px] text-bone-faint">{subtext}</span>
      )}
    </li>
  );
}

function StepRow({ step }: { step: MintStep }) {
  const { id, status, sig } = step;
  if (status === 'active') {
    return <ActiveRow label={STEP_LABELS[id]} subtext={STEP_SUBTEXT[id]} tone={ROW_TONE.active} />;
  }
  return (
    <li
      className={`flex items-center gap-2 font-mono tracking-tight transition-colors ${ROW_TONE[status]}`}
    >
      <span className="inline-flex w-4 justify-center" aria-hidden>
        {STATUS_GLYPH[status]}
      </span>
      <span>{STEP_LABELS[id]}</span>
      {sig && <SolscanLink sig={sig} />}
    </li>
  );
}

export interface MintConsoleProps {
  steps: MintStep[];
  state: MintState;
  error: MintError | null;
  canResume: boolean;
  onResume: () => void;
  onRetry: () => void;
}

export function MintConsole({
  steps,
  state,
  error,
  canResume,
  onResume,
  onRetry,
}: MintConsoleProps) {
  if (steps.length === 0 && !error) return null;

  // The post-confirm dead zone: in-flight but nothing active and no error. The
  // server emits no step while it rebuilds Ace clients + re-verifies, so synthesize
  // an active row to keep the list alive; it vanishes the instant a real step lights.
  const shouldShowGap =
    steps.length > 0 &&
    !error &&
    state !== 'done' &&
    steps.every((s) => s.status !== 'active' && s.status !== 'error');

  const hasActive = steps.some((s) => s.status === 'active');
  const next = computeNextStep(steps);
  const showNext = state !== 'done' && !error && next !== null && (hasActive || shouldShowGap);

  return (
    <div className="cb-rise flex flex-col gap-3 rounded-[3px] border border-ink-line bg-ink-raised/60 p-4">
      {steps.length > 0 && (
        // The step list is the sole polite live region while the flow is in
        // flight. On error the role="alert" panel below carries the human
        // reason, so strip the live attributes (and aria-hide the ✗ list) to
        // avoid a competing/duplicate announcement.
        <ul
          {...(error ? { 'aria-hidden': true } : { role: 'status', 'aria-live': 'polite' })}
          className="flex flex-col gap-1.5"
        >
          {steps.map((step) => (
            <StepRow key={step.id} step={step} />
          ))}
          {shouldShowGap && (
            <ActiveRow
              key="__gap"
              label="Re-verifying on-chain…"
              subtext="Preparing your story…"
              tone={ROW_TONE.active}
            />
          )}
        </ul>
      )}

      {showNext && next && (
        <p className="font-mono text-[11px] text-bone-faint/50">Next: {STEP_LABELS[next]}</p>
      )}

      {error && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-[3px] border border-ember/50 bg-ember/5 p-3"
        >
          <p className="font-mono text-sm text-ember">
            {MINT_ERROR_COPY[error.kind] ?? MINT_ERROR_COPY.generic}
          </p>
          {error.message && (
            <p className="min-w-0 break-all font-mono text-xs text-bone-dim">{error.message}</p>
          )}
          {canResume ? (
            <button
              type="button"
              onClick={onResume}
              className="self-start font-mono text-xs uppercase tracking-[0.18em] text-bone-dim underline-offset-4 hover:text-amber hover:underline"
            >
              Resume
            </button>
          ) : (
            <button
              type="button"
              onClick={onRetry}
              className="self-start font-mono text-xs uppercase tracking-[0.18em] text-bone-dim underline-offset-4 hover:text-amber hover:underline"
            >
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
