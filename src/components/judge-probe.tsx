'use client';

/**
 * JudgeProbe — a live, client-side 402 handshake probe for /api/mint/story.
 *
 * Hits the paid mint endpoint with NO X-Payment header and renders the returned
 * `402 Payment Required` body verbatim. This proves the x402 payment-required
 * handshake (scheme/network/asset/payTo/price) without paying anything — the
 * reviewer sees the raw `accepts[]` the wallet would satisfy.
 *
 * Open, read-only: a GET to the mint route returns the same 402 as an unpaid
 * POST (see route.ts GET handler). No secrets cross this boundary — the 402 body
 * is on-chain-public payment metadata only.
 */

import { useCallback, useState } from 'react';

const PROBE_PATH = '/api/mint/story';

interface ProbeState {
  status: 'idle' | 'probing' | 'ok' | 'error';
  httpStatus?: number;
  body?: string;
  error?: string;
}

export function JudgeProbe() {
  const [state, setState] = useState<ProbeState>({ status: 'idle' });

  const probe = useCallback(async () => {
    setState({ status: 'probing' });
    try {
      // GET, no X-Payment — the route answers with the 402 accepts[] envelope.
      const res = await fetch(PROBE_PATH, { method: 'GET' });
      const json = await res.json();
      setState({
        status: 'ok',
        httpStatus: res.status,
        body: JSON.stringify(json, null, 2),
      });
    } catch (err) {
      setState({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  const probing = state.status === 'probing';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <code className="font-mono text-[13px] text-bone-dim">
          GET <span className="text-bone">{PROBE_PATH}</span>
          <span className="text-bone-faint"> · no X-Payment header</span>
        </code>
        <button
          type="button"
          onClick={probe}
          disabled={probing}
          className="group inline-flex items-center gap-2 rounded-[3px] border border-amber bg-amber/10 px-5 py-2.5 font-mono text-xs uppercase tracking-[0.18em] text-amber transition-colors hover:bg-amber hover:text-ink disabled:cursor-wait disabled:opacity-70"
        >
          {probing ? 'Probing…' : 'Run 402 probe'}
          <span
            aria-hidden
            className="transition-transform duration-140 group-hover:translate-x-0.5"
          >
            →
          </span>
        </button>
      </div>

      {state.status === 'ok' && (
        <div className="cb-rise flex flex-col gap-3">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em]">
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${
                state.httpStatus === 402 ? 'bg-verdant' : 'bg-ember'
              }`}
            />
            <span className={state.httpStatus === 402 ? 'text-verdant' : 'text-ember'}>
              HTTP {state.httpStatus}
              {state.httpStatus === 402 ? ' — Payment Required (handshake confirmed)' : ''}
            </span>
          </div>
          <pre className="overflow-x-auto rounded-[3px] border border-ink-line bg-ink p-4 font-mono text-[12px] leading-relaxed text-bone-dim">
            {state.body}
          </pre>
        </div>
      )}

      {state.status === 'error' && (
        <p role="alert" className="font-mono text-sm text-ember">
          Probe failed: {state.error}
        </p>
      )}

      {state.status === 'idle' && (
        <p className="font-mono text-[12px] text-bone-faint">
          Run the probe to fetch the unpaid <span className="text-bone-dim">402</span> and inspect
          the raw <span className="text-bone-dim">accepts[]</span> payment requirements.
        </p>
      )}
    </div>
  );
}
