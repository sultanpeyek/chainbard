'use client';

/**
 * useMint — browser-side orchestrator for the reactive paid mint (ADR 0006).
 *
 * Flow (Reactive, streamed):
 *   1. POST /api/mint/story with no payment → 402 carrying accepts[0]
 *      (the x402 requirements).
 *   2. buildX402Envelope({ requirements, signTransaction: wallet.signTransaction,
 *      buyerPubkey, connection }) → base64 X-Payment header. The builder composes,
 *      dry-run simulates, and signs internally; the client synthesizes the
 *      'build' → 'dry-run' → 'sign' steps in sequence around it.
 *   3. POST /api/mint/story again with header 'X-Payment'. The route now RESPONDS
 *      AS AN NDJSON STREAM (HTTP 200, content-type 'application/x-ndjson'): one
 *      JSON event per '\n'-terminated line, flushed as each step completes. The
 *      client reads response.body, decodes chunks (handling partial UTF-8 and
 *      partial lines), and drives the step model from {t:'step'} events. A
 *      {t:'done'} line resolves success; a {t:'error'} line resolves failure.
 *
 * Retry boundary: an error event carrying paymentSig means the buyer already
 * paid — the UI shows "Resume" (replay the SAME stored X-Payment header + body,
 * no re-sign). An error without paymentSig is uncharged — "Try again" runs a
 * fresh mint() from scratch.
 *
 * Payment is real mainnet USDC; signing happens in the user's Wallet-Standard
 * wallet (useWallet().signTransaction). No keypairs in app code.
 *
 * The flow core (runMint / runMintFlow) takes injectable boundaries — fetch,
 * signTransaction, connection, buyerPubkey, navigate, onStep — so it is
 * unit-testable with mocks. The hook wires useWallet/useConnection/useRouter.
 */

import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import type { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildX402Envelope,
  type X402BuilderConnection,
  type X402Requirements,
} from '@/modules/x402-envelope-builder';

/** Discrete phases of the mint, exposed for UI state. */
export type MintState = 'idle' | 'previewing' | 'awaiting-signature' | 'settling' | 'done';

/**
 * Step identifiers for the granular progress model. Client-only steps (build,
 * dry-run, sign) are synthesized locally before the stream opens; the rest are
 * emitted by the route's NDJSON stream. Order matches the full UI sequence:
 * build, dry-run, sign, verify, settle, confirm, [direct], facts, [search],
 * write, paint, save, memo. ('direct' fires only when a brief was supplied.)
 */
export type StepId =
  | 'build'
  | 'dry-run'
  | 'sign'
  | 'verify'
  | 'settle'
  | 'confirm'
  | 'direct'
  | 'facts'
  | 'search'
  | 'write'
  | 'paint'
  | 'save'
  | 'memo';

export type StepStatus = 'pending' | 'active' | 'done' | 'error';

export interface MintStep {
  id: StepId;
  status: StepStatus;
  sig?: string;
}

/**
 * Discrete error variants, mapped from wallet failures + the route's in-stream
 * error events.
 *   - rejected: the user declined the signature in their wallet.
 *   - insufficient-usdc: buyer lacks enough USDC for the transfer.
 *   - blockhash-expired: the signed tx's blockhash lapsed before settle.
 *   - facilitator-refundable: paid but not rendered; eligible for refund.
 *   - generic: anything else (no wallet, network error, fatal route error).
 */
export type MintErrorKind =
  | 'rejected'
  | 'insufficient-usdc'
  | 'blockhash-expired'
  | 'facilitator-refundable'
  | 'generic';

export interface MintError {
  kind: MintErrorKind;
  message: string;
  /** Present iff the buyer was charged — enables Resume (replay same header). */
  paymentSig?: string;
}

export interface MintArgs {
  input: string;
  buyer: string;
  tone?: string;
  /** Optional buyer brief. Sent in the POST body ONLY when non-empty. */
  brief?: string;
}

/** Injectable boundaries for the mint flow core (mocked in tests). */
export interface RunMintDeps {
  fetch: typeof fetch;
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
  buyerPubkey: PublicKey;
  connection: X402BuilderConnection;
  /** Endpoint to POST the mint to. */
  endpoint: string;
  /** Phase callback so the hook can surface awaiting-signature / settling. */
  onState?: (state: MintState) => void;
  /** Granular step callback — fires once per build/dry-run/sign + stream event. */
  onStep?: (step: MintStep) => void;
  /**
   * Sink for the built X-Payment header + request body, so the hook can stash
   * them and replay (Resume) without rebuilding or re-signing.
   */
  onEnvelope?: (envelope: { header: string; body: string }) => void;
}

/** Result of a successful mint: the share page to navigate to. */
export interface RunMintOk {
  ok: true;
  shareUrl: string;
  paymentSig: string;
  memoSig: string;
}

export interface RunMintErr {
  ok: false;
  error: MintError;
}

export type RunMintResult = RunMintOk | RunMintErr;

const MINT_ENDPOINT = '/api/mint/story';
/** How long the done state stays visible before navigating to the share page. */
const DONE_NAV_DELAY_MS = 1500;

// Verbose client-side trace of the mint handshake, tagged `[useMint]`. Mirrors
// the server's `[mint/story]` log so a mint can be debugged from both ends in
// the browser console (build/sign locally → streamed server steps).
const dbg = (msg: string, extra?: Record<string, unknown>): void => {
  if (extra) console.debug(`[useMint] ${msg}`, extra);
  else console.debug(`[useMint] ${msg}`);
};

interface Accept extends X402Requirements {
  maxTimeoutSeconds?: number;
}

/** NDJSON event objects emitted by the route's WITH-X-Payment stream. */
type StreamStepEvent = { t: 'step'; id: StepId; status: 'active' | 'done'; sig?: string };
type StreamDoneEvent = { t: 'done'; shareUrl: string; paymentSig: string; memoSig: string };
type StreamErrorEvent = {
  t: 'error';
  id: StepId;
  kind: MintErrorKind;
  reason: string;
  paymentSig?: string;
};
type StreamEvent = StreamStepEvent | StreamDoneEvent | StreamErrorEvent;

function err(kind: MintErrorKind, message: string, paymentSig?: string): RunMintErr {
  return { ok: false, error: { kind, message, ...(paymentSig ? { paymentSig } : {}) } };
}

/** Map a thrown wallet/build error to a discrete error variant. */
function classifyThrown(e: unknown): RunMintErr {
  const message = e instanceof Error ? e.message : String(e);
  const lower = message.toLowerCase();
  if (
    lower.includes('reject') ||
    lower.includes('declined') ||
    lower.includes('cancel') ||
    lower.includes('user denied')
  ) {
    return err('rejected', message);
  }
  if (lower.includes('blockhash')) return err('blockhash-expired', message);
  if (lower.includes('insufficient')) return err('insufficient-usdc', message);
  return err('generic', message);
}

/**
 * Read the route's NDJSON stream and drive the step model. Resolves on the
 * terminal {t:'done'} or {t:'error'} line. A stream that closes without a
 * terminal event resolves to a generic error.
 */
async function readMintStream(
  res: Response,
  onStep?: (step: MintStep) => void,
): Promise<RunMintResult> {
  const body = res.body;
  if (!body) return err('generic', 'mint stream missing body');

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let terminal: RunMintResult | null = null;

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let event: StreamEvent;
    try {
      event = JSON.parse(trimmed) as StreamEvent;
    } catch {
      return; // skip malformed line; a missing terminal is caught below.
    }
    if (event.t === 'step') {
      dbg(`stream step ${event.id} ${event.status}`, event.sig ? { sig: event.sig } : undefined);
      onStep?.({ id: event.id, status: event.status, ...(event.sig ? { sig: event.sig } : {}) });
    } else if (event.t === 'done') {
      dbg('stream done', { paymentSig: event.paymentSig, memoSig: event.memoSig });
      terminal = {
        ok: true,
        shareUrl: event.shareUrl,
        paymentSig: event.paymentSig,
        memoSig: event.memoSig,
      };
    } else if (event.t === 'error') {
      dbg(`stream error @${event.id}`, {
        kind: event.kind,
        reason: event.reason,
        paymentSig: event.paymentSig,
      });
      onStep?.({ id: event.id, status: 'error' });
      terminal = err(event.kind, event.reason, event.paymentSig);
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let nl = buffer.indexOf('\n');
    while (nl !== -1) {
      handleLine(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
      nl = buffer.indexOf('\n');
    }
    if (done) break;
  }
  // Flush any trailing bytes + a final unterminated line.
  buffer += decoder.decode();
  if (buffer.trim()) handleLine(buffer);

  return terminal ?? err('generic', 'mint stream closed without a terminal event');
}

/**
 * Pure-ish flow core. Performs the 402 → build/sign → settle handshake against
 * the injected boundaries. The client-only steps (build, dry-run, sign) are
 * synthesized around buildX402Envelope (which composes, simulates, and signs
 * internally); the route's stream drives the rest. The built X-Payment header +
 * body are reported via onEnvelope so the caller can Resume.
 */
export async function runMint(args: MintArgs, deps: RunMintDeps): Promise<RunMintResult> {
  const {
    fetch: doFetch,
    signTransaction,
    buyerPubkey,
    connection,
    endpoint,
    onState,
    onStep,
  } = deps;
  // Send `brief` only when it carries non-whitespace content; a briefless mint
  // omits the key entirely so the server renders exactly as before.
  const hasBrief = Boolean(args.brief?.trim());
  const bodyJson = JSON.stringify({
    input: args.input,
    buyer: args.buyer,
    tone: args.tone,
    ...(hasBrief ? { brief: args.brief } : {}),
  });

  // 1. Probe for the 402 requirements.
  onState?.('previewing');
  let probe: Response;
  try {
    probe = await doFetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: bodyJson,
    });
  } catch (e) {
    return classifyThrown(e);
  }
  if (probe.status !== 402) {
    return err('generic', `expected 402, got ${probe.status}`);
  }
  let accepts: Accept[];
  try {
    const json = (await probe.json()) as { accepts?: Accept[] };
    accepts = json.accepts ?? [];
  } catch {
    return err('generic', 'malformed 402 body');
  }
  const requirements = accepts[0];
  if (!requirements) return err('generic', '402 missing accepts[0]');

  // 2. Build + sign the x402 envelope (wallet prompts here). buildX402Envelope
  // composes, dry-run simulates, then signs — so synthesize the three client
  // steps in that sequence around the single call.
  onState?.('awaiting-signature');
  onStep?.({ id: 'build', status: 'active' });
  let header: string;
  try {
    header = await buildX402Envelope({
      requirements,
      signTransaction,
      buyerPubkey,
      connection,
    });
  } catch (e) {
    onStep?.({ id: 'build', status: 'error' });
    return classifyThrown(e);
  }
  onStep?.({ id: 'build', status: 'done' });
  onStep?.({ id: 'dry-run', status: 'active' });
  onStep?.({ id: 'dry-run', status: 'done' });
  onStep?.({ id: 'sign', status: 'active' });
  onStep?.({ id: 'sign', status: 'done' });

  // 3. Settle with payment; the route streams server-side progress.
  deps.onEnvelope?.({ header, body: bodyJson });
  return runMintFlow({ header, body: bodyJson }, deps);
}

/**
 * Stream half of the flow: POST the (already built) X-Payment header + body and
 * read the NDJSON stream. Used by runMint after signing, and by Resume to replay
 * the SAME envelope without rebuilding or re-signing.
 */
export async function runMintFlow(
  envelope: { header: string; body: string },
  deps: Pick<RunMintDeps, 'fetch' | 'endpoint' | 'onState' | 'onStep'>,
): Promise<RunMintResult> {
  const { fetch: doFetch, endpoint, onState, onStep } = deps;
  onState?.('settling');
  let settle: Response;
  try {
    settle = await doFetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-payment': envelope.header },
      body: envelope.body,
    });
  } catch (e) {
    return classifyThrown(e);
  }
  // The WITH-X-Payment contract is HTTP 200 + NDJSON. A non-200 here is a
  // pre-stream guard rejection (e.g. an unsupported kind 400s as plain JSON) —
  // surface its `error` instead of letting readMintStream report the cryptic
  // "closed without a terminal event".
  if (!settle.ok) {
    let reason = `mint failed (${settle.status})`;
    try {
      const json = (await settle.json()) as { error?: string };
      if (json?.error) reason = json.error;
    } catch {
      // keep the status-based fallback reason
    }
    return err('generic', reason);
  }
  const result = await readMintStream(settle, onStep);
  if (result.ok) onState?.('done');
  return result;
}

export interface UseMintResult {
  /** Current phase. */
  state: MintState;
  /** Granular step progress (build → … → memo). Reset at the start of mint(). */
  steps: MintStep[];
  /** Last error, or null. Cleared at the start of each mint(). */
  error: MintError | null;
  /** Resolved share target after a successful mint (navigation pending/issued). */
  shareUrl: string | null;
  /** True while a mint is in flight. */
  isMinting: boolean;
  /** True iff the last error carried a paymentSig (buyer paid → Resume offered). */
  canResume: boolean;
  /** Start the paid mint. On success, navigates to the share page after a delay. */
  mint: (args: MintArgs) => Promise<RunMintResult>;
  /** Replay the stored X-Payment header + body without rebuilding or re-signing. */
  resume: () => Promise<RunMintResult>;
  /** Reset to idle (clears error + shareUrl + steps). */
  reset: () => void;
}

/**
 * useMint — wires the wallet, connection, and router to the runMint flow core.
 * On a successful mint it shows the done state, then navigates to the share page
 * after DONE_NAV_DELAY_MS so the UI can surface the done links first.
 */
export function useMint(): UseMintResult {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const router = useRouter();

  const [state, setState] = useState<MintState>('idle');
  const [steps, setSteps] = useState<MintStep[]>([]);
  const [error, setError] = useState<MintError | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  // Stored envelope for Resume, and a cancellable nav timer.
  const envelopeRef = useRef<{ header: string; body: string } | null>(null);
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (navTimerRef.current) clearTimeout(navTimerRef.current);
    },
    [],
  );

  const applyStep = useCallback((step: MintStep) => {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.id === step.id);
      if (idx === -1) return [...prev, step];
      const next = [...prev];
      next[idx] = { ...next[idx], ...step };
      return next;
    });
  }, []);

  const finish = useCallback(
    (result: RunMintResult) => {
      if (result.ok) {
        setShareUrl(result.shareUrl);
        setState('done');
        if (navTimerRef.current) clearTimeout(navTimerRef.current);
        navTimerRef.current = setTimeout(() => {
          router.push(result.shareUrl);
        }, DONE_NAV_DELAY_MS);
      } else {
        setError(result.error);
        setState('idle');
      }
      return result;
    },
    [router],
  );

  const mint = useCallback(
    async (args: MintArgs): Promise<RunMintResult> => {
      setError(null);
      setShareUrl(null);
      setSteps([]);
      envelopeRef.current = null;

      if (!publicKey || !signTransaction) {
        const e = err('generic', 'connect a wallet first');
        setError(e.error);
        setState('idle');
        return e;
      }

      const result = await runMint(args, {
        fetch,
        signTransaction,
        buyerPubkey: publicKey,
        connection,
        endpoint: MINT_ENDPOINT,
        onState: setState,
        onStep: applyStep,
        onEnvelope: (env) => {
          envelopeRef.current = env;
        },
      });
      return finish(result);
    },
    [publicKey, signTransaction, connection, applyStep, finish],
  );

  const resume = useCallback(async (): Promise<RunMintResult> => {
    const envelope = envelopeRef.current;
    if (!envelope) {
      const e = err('generic', 'nothing to resume');
      setError(e.error);
      return e;
    }
    setError(null);
    const result = await runMintFlow(envelope, {
      fetch,
      endpoint: MINT_ENDPOINT,
      onState: setState,
      onStep: applyStep,
    });
    return finish(result);
  }, [applyStep, finish]);

  const reset = useCallback(() => {
    if (navTimerRef.current) clearTimeout(navTimerRef.current);
    setState('idle');
    setSteps([]);
    setError(null);
    setShareUrl(null);
    envelopeRef.current = null;
  }, []);

  return {
    state,
    steps,
    error,
    shareUrl,
    isMinting: state !== 'idle' && state !== 'done',
    canResume: Boolean(error?.paymentSig),
    mint,
    resume,
    reset,
  };
}
