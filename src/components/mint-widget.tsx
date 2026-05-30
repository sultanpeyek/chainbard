'use client';

/**
 * MintWidget — the homepage-hero reactive flow (ADR 0006 / CONTEXT "Mint widget").
 *
 *   paste input → free Preview (kind + cheap on-chain facts, no Ace spend)
 *   → pick a tone → connect a Wallet-Standard wallet → "Mint · 0.30 USDC"
 *   → useMint runs the 402 → sign → settle handshake → redirect to /[input].
 *
 * Preview runs through /api/preview (server reads the RPC env the browser can't).
 * Mint runs through useMint, which signs in the user's wallet — no keypairs here.
 * Discrete mint errors (rejected / insufficient-usdc / blockhash-expired /
 * facilitator-refundable / generic) each get a clear message + retry affordance.
 */

import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { type MintStep, useMint } from '@/hooks/use-mint';
import { fetchPreview, type PreviewOutcome } from '@/lib/fetch-preview';
import { AiDisclaimer } from './ai-disclaimer';
import { KindBadge } from './kind-badge';
import { MintConsole } from './mint-console';

// Max length of the optional patron brief (steers voice/angle via the Director).
const BRIEF_MAX = 280;

export function MintWidget() {
  const inputId = useId();
  const briefId = useId();
  const { connected, publicKey } = useWallet();
  const { mint, state, steps, error, isMinting, canResume, resume, reset } = useMint();

  const [input, setInput] = useState('');
  const [brief, setBrief] = useState('');
  const [preview, setPreview] = useState<PreviewOutcome | null>(null);
  const [previewing, setPreviewing] = useState(false);
  // Track which input string the current preview belongs to, so editing the box
  // invalidates a stale preview.
  const previewedFor = useRef<string | null>(null);

  const trimmed = input.trim();
  const canPreview = trimmed.length >= 32 && !previewing;
  const hasGoodPreview = preview?.ok === true && previewedFor.current === trimmed;
  const mintable = hasGoodPreview;

  const runPreview = useCallback(
    async (target?: string) => {
      const value = (target ?? input).trim();
      if (value.length === 0) return;
      setPreviewing(true);
      reset();
      const outcome = await fetchPreview(value);
      previewedFor.current = value;
      setPreview(outcome);
      setPreviewing(false);
    },
    [input, reset],
  );

  // Seed from the paywall / Featured handoff (`/?input=…`, ADR 0006): a user who
  // previews at /[input], hits the paywall, and clicks "Mint" lands here with the
  // input prefilled — auto-run the free preview so the flow continues instead of
  // dead-ending on an empty widget. Runs once, after hydration.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const params = new URLSearchParams(window.location.search);
    const seedInput = params.get('input');
    if (!seedInput) return;
    setInput(seedInput);
    void runPreview(seedInput);
  }, [runPreview]);

  const onInputChange = (value: string) => {
    setInput(value);
    if (preview) setPreview(null);
    previewedFor.current = null;
  };

  const runMint = useCallback(() => {
    if (!mintable || !preview?.ok || !publicKey) return;
    const trimmedBrief = brief.trim();
    void mint({
      input: trimmed,
      buyer: publicKey.toBase58(),
      ...(trimmedBrief ? { brief } : {}),
    });
  }, [mintable, preview, mint, trimmed, brief, publicKey]);

  return (
    <div className="flex flex-col gap-5">
      {/* input + preview trigger */}
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-amber">
            <span aria-hidden className="cb-lantern">
              ✦
            </span>
            Start here
          </span>
          <label htmlFor={inputId} className="cb-display text-lg text-bone">
            Paste a Solana identifier
          </label>
        </div>
        <div className="group relative flex items-stretch overflow-hidden rounded-[4px] border border-bone-faint/30 bg-ink-raised/80 p-1.5 shadow-[inset_0_0_40px_-26px_rgba(232,161,58,0.7)] backdrop-blur transition-all focus-within:border-amber focus-within:shadow-[inset_0_0_40px_-22px_rgba(232,161,58,0.8),0_0_0_3px_rgba(232,161,58,0.12)]">
          {/* amber "ledger line" — the active entry rule; brightens on focus */}
          <span
            aria-hidden
            className="w-[3px] shrink-0 self-stretch rounded-full bg-amber/50 transition-colors group-focus-within:bg-amber"
          />
          <input
            id={inputId}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canPreview) {
                e.preventDefault();
                void runPreview();
              }
            }}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="address, signature, or mint…"
            // The container's focus-within:border-amber is the focus ring; the
            // input's own outline (unlayered global focus rule) would clip to a
            // stray vertical line against overflow-hidden, so suppress it here.
            style={{ outline: 'none' }}
            className="min-w-0 flex-1 bg-transparent px-3 py-3 font-mono text-base text-bone placeholder:text-bone-dim/70"
          />
          <button
            type="button"
            onClick={() => void runPreview()}
            disabled={!canPreview}
            className="shrink-0 self-stretch rounded-[2px] border border-amber/40 bg-amber/10 px-4 font-mono text-xs uppercase tracking-[0.18em] text-amber transition-colors enabled:hover:bg-amber enabled:hover:text-ink disabled:cursor-not-allowed disabled:border-transparent disabled:bg-transparent disabled:text-bone-faint/40"
          >
            {previewing ? 'Reading…' : 'Preview'}
          </button>
        </div>
        {/* what the box accepts — full legend, no truncation */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[10px] uppercase tracking-[0.16em] text-bone-faint">
          {['wallet', 'tx signature', 'nft', 'token mint'].map((kind, i) => (
            <span key={kind} className="flex items-center gap-2.5">
              {i > 0 && (
                <span aria-hidden className="text-amber/40">
                  ·
                </span>
              )}
              {kind}
            </span>
          ))}
        </div>
        <p className="font-mono text-[11px] text-bone-faint">
          Free preview — detected kind and a few on-chain facts. No spend, no AI yet.
        </p>
      </div>

      {/* preview result */}
      {preview && previewedFor.current === trimmed && (
        <div className="cb-rise rounded-[3px] border border-ink-line bg-ink-raised/60 p-5">
          {preview.ok ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="cb-eyebrow">Preview</span>
                <KindBadge kind={preview.result.kind} />
              </div>
              <dl className="grid gap-px overflow-hidden rounded-[2px] border border-ink-line bg-ink-line">
                {preview.result.facts.map((fact) => (
                  <div
                    key={fact.label}
                    className="flex items-baseline justify-between gap-4 bg-ink px-3 py-2.5"
                  >
                    <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-bone-faint">
                      {fact.label}
                    </dt>
                    <dd className="break-all text-right font-mono text-sm text-bone">
                      {fact.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : (
            <p className="font-mono text-sm text-ember">{preview.reason}</p>
          )}
        </div>
      )}

      {/* brief + connect + mint — only once a mintable preview exists */}
      {mintable && (
        <div className="cb-rise flex flex-col gap-5">
          {/* Paid mint is temporarily blocked: browser wallets (Phantom/Solflare)
              inject Lighthouse guard instructions on sign, and the payment
              facilitator rejects them. The failure is pre-settle, so the wallet
              is never charged. Tracked in the AceData facilitator. */}
          <div className="flex flex-col gap-1 rounded-[3px] border border-ember/40 bg-ember/10 px-4 py-3">
            <span className="cb-eyebrow text-ember">Paid mint unavailable</span>
            <p className="font-mono text-[11px] leading-relaxed text-bone-faint">
              Minting through a browser wallet doesn&rsquo;t work right now — a payment-facilitator
              bug rejects Phantom/Solflare signatures. It fails before payment, so{' '}
              <span className="text-bone">your wallet is never charged</span>. A fix is in progress.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={briefId} className="cb-eyebrow">
              The patron&rsquo;s brief
              <span className="ml-2 normal-case tracking-normal text-bone-faint">optional</span>
            </label>
            <textarea
              id={briefId}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              maxLength={BRIEF_MAX}
              rows={3}
              placeholder="Steer the voice — a tone, an angle, what to dwell on. The chain stays the source of truth."
              spellCheck={false}
              style={{ outline: 'none' }}
              className="w-full resize-none rounded-[3px] border border-bone-faint/30 bg-ink-raised/80 px-3 py-2.5 font-mono text-sm text-bone placeholder:text-bone-dim/60 focus:border-amber"
            />
            <div className="flex items-center justify-between font-mono text-[10px] text-bone-faint">
              <span>Steers voice &amp; angle only — never the facts.</span>
              <span>
                {brief.length}/{BRIEF_MAX}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {!connected ? (
              <div className="flex flex-col gap-2 [&_.wallet-adapter-dropdown]:w-full">
                <span className="cb-eyebrow">Connect to mint</span>
                <WalletMultiButton />
              </div>
            ) : (
              <button
                type="button"
                onClick={runMint}
                // Gate on canResume too: after a paid-but-failed mint the buyer
                // is already charged and `error.paymentSig` is set, so a fresh
                // Mint click here would build a NEW nonce and double-charge.
                // Steer the buyer to the console's Resume (replays the same
                // envelope). "Start over" below clears the paid error first when
                // they genuinely want to abandon and begin a brand-new mint.
                disabled={isMinting || canResume}
                className="group relative flex items-center justify-center gap-3 rounded-[3px] border border-amber bg-amber/10 px-6 py-4 font-mono text-sm uppercase tracking-[0.18em] text-amber transition-colors hover:bg-amber hover:text-ink disabled:cursor-not-allowed disabled:opacity-70"
              >
                <span aria-hidden className="cb-lantern text-base">
                  ✦
                </span>
                {isMinting
                  ? mintProgressLabel(state, steps)
                  : canResume
                    ? 'Paid — resume below'
                    : 'Mint · 0.30 USDC'}
              </button>
            )}
            {connected && canResume && (
              // Deliberate escape hatch: a paid buyer who does NOT want to resume
              // can clear the paid error and re-enable a fresh Mint. Kept separate
              // from the Mint button so abandoning a paid envelope is an explicit
              // choice, never the accidental default.
              <button
                type="button"
                onClick={reset}
                className="self-start font-mono text-[10px] uppercase tracking-[0.18em] text-bone-faint underline-offset-4 hover:text-amber hover:underline"
              >
                Start over
              </button>
            )}
            {connected && (
              <div className="self-stretch [&_.wallet-adapter-dropdown]:w-full">
                <WalletMultiButton />
              </div>
            )}
          </div>

          {(isMinting || error || steps.length > 0) && (
            <MintConsole
              steps={steps}
              state={state}
              error={error}
              canResume={canResume}
              onResume={resume}
              onRetry={runMint}
            />
          )}
        </div>
      )}

      <div className="border-t border-ink-line pt-4">
        <AiDisclaimer variant="inline" />
      </div>
    </div>
  );
}

const STEP_PROGRESS_LABELS: Record<MintStep['id'], string> = {
  build: 'Building payment…',
  'dry-run': 'Dry-running…',
  sign: 'Awaiting signature…',
  verify: 'Verifying payment…',
  settle: 'Settling on-chain…',
  confirm: 'Confirming…',
  direct: 'Reading the brief…',
  facts: 'Gathering facts…',
  search: 'Searching the web…',
  write: 'Writing your story…',
  paint: 'Generating image…',
  save: 'Saving…',
  memo: 'Stamping receipt…',
};

// Button label while minting reflects the active step; falls back to the coarse
// phase label when no step is active yet (e.g. the initial 402 probe).
function mintProgressLabel(state: string, steps: MintStep[]): string {
  if (state === 'done') return 'Opening story…';
  const active = steps.find((s) => s.status === 'active');
  if (active) return STEP_PROGRESS_LABELS[active.id];
  return 'Minting…';
}
