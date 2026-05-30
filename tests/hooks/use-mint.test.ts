import { describe, expect, test } from 'bun:test';
import { PublicKey, type VersionedTransaction } from '@solana/web3.js';
import { type MintState, type MintStep, runMint } from '@/hooks/use-mint';

// On-curve buyer pubkey so its USDC ATA derives without TokenOwnerOffCurveError.
const BUYER = new PublicKey('GThUX1Atko4tqhN2NaiTazWSeFWMuiUvfFnyJyUghFMz');
const SHARE_URL = '/GThUX1Atko4tqhN2NaiTazWSeFWMuiUvfFnyJyUghFMz';
const ENDPOINT = '/api/mint/story';
const PAYMENT_SIG = '5'.repeat(64);
const MEMO_SIG = '6'.repeat(64);

const REQUIREMENTS = {
  scheme: 'exact',
  network: 'solana',
  maxAmountRequired: '300000',
  payTo: '9cssRtj1tpo8juYMKVw4BLonEXnSH2e6bfc9Qp88fN48',
  asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  extra: { decimals: 6, feePayer: '3SPm6qbgsDkj24MuR8Ss4sH97fziqyCiqFKDyeVU2igq' },
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// Build an NDJSON streaming Response from a list of event objects. `chunkSize`
// lets a test split lines across reads to exercise partial-line/partial-UTF-8
// buffering.
function ndjsonResponse(events: unknown[], chunkSize?: number): Response {
  const text = events.map((e) => `${JSON.stringify(e)}\n`).join('');
  const bytes = new TextEncoder().encode(text);
  const size = chunkSize ?? bytes.length;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += size) {
        controller.enqueue(bytes.slice(i, i + size));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'application/x-ndjson' },
  });
}

// A done stream covering the server-emitted step order (wallet kind: no search).
function doneStream(chunkSize?: number): Response {
  return ndjsonResponse(
    [
      { t: 'step', id: 'verify', status: 'active' },
      { t: 'step', id: 'verify', status: 'done' },
      { t: 'step', id: 'settle', status: 'active' },
      { t: 'step', id: 'settle', status: 'done', sig: PAYMENT_SIG },
      { t: 'step', id: 'confirm', status: 'active' },
      { t: 'step', id: 'confirm', status: 'done' },
      { t: 'step', id: 'facts', status: 'active' },
      { t: 'step', id: 'facts', status: 'done' },
      { t: 'step', id: 'write', status: 'active' },
      { t: 'step', id: 'write', status: 'done' },
      { t: 'step', id: 'paint', status: 'active' },
      { t: 'step', id: 'paint', status: 'done' },
      { t: 'step', id: 'save', status: 'active' },
      { t: 'step', id: 'save', status: 'done' },
      { t: 'step', id: 'memo', status: 'active' },
      { t: 'step', id: 'memo', status: 'done', sig: MEMO_SIG },
      { t: 'done', shareUrl: SHARE_URL, paymentSig: PAYMENT_SIG, memoSig: MEMO_SIG },
    ],
    chunkSize,
  );
}

// Mock connection — never hits the network. simulateTransaction returns a clean
// dry-run (err: null) so buildX402Envelope proceeds to sign.
const connection = {
  async getLatestBlockhash() {
    return { blockhash: '11111111111111111111111111111111' };
  },
  async simulateTransaction() {
    return { value: { err: null } };
  },
};

// Mock wallet signer that returns the tx unchanged (default: cooperative).
function makeSigner() {
  const calls: VersionedTransaction[] = [];
  const signTransaction = async (tx: VersionedTransaction) => {
    calls.push(tx);
    return tx;
  };
  return { signTransaction, calls };
}

// Scripted fetch: first call returns the 402, second returns `settleResponse`.
function makeFetch(settleResponse: Response) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const doFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const hasPayment = Boolean((init?.headers as Record<string, string>)?.['x-payment']);
    if (!hasPayment) return jsonResponse(402, { x402Version: 2, accepts: [REQUIREMENTS] });
    return settleResponse;
  }) as unknown as typeof fetch;
  return { doFetch, calls };
}

function deps(
  settleResponse: Response,
  signTransaction = makeSigner().signTransaction,
  states: MintState[] = [],
  steps: MintStep[] = [],
  envelopes: Array<{ header: string; body: string }> = [],
) {
  const { doFetch, calls } = makeFetch(settleResponse);
  return {
    calls,
    deps: {
      fetch: doFetch,
      signTransaction,
      buyerPubkey: BUYER,
      connection,
      endpoint: ENDPOINT,
      onState: (s: MintState) => states.push(s),
      onStep: (step: MintStep) => steps.push(step),
      onEnvelope: (env: { header: string; body: string }) => envelopes.push(env),
    },
  };
}

const ARGS = { input: BUYER.toBase58(), buyer: BUYER.toBase58(), tone: 'auto' };

describe('runMint', () => {
  test('happy path: 402 → sign → stream → done yields share target + sigs', async () => {
    const states: MintState[] = [];
    const steps: MintStep[] = [];
    const envelopes: Array<{ header: string; body: string }> = [];
    const { deps: d, calls } = deps(doneStream(), undefined, states, steps, envelopes);

    const result = await runMint(ARGS, d);

    expect(result).toEqual({
      ok: true,
      shareUrl: SHARE_URL,
      paymentSig: PAYMENT_SIG,
      memoSig: MEMO_SIG,
    });
    // Two POSTs: probe (no payment) then settle (with X-Payment).
    expect(calls.length).toBe(2);
    expect((calls[0]?.init?.headers as Record<string, string>)['x-payment']).toBeUndefined();
    expect((calls[1]?.init?.headers as Record<string, string>)['x-payment']).toBeTruthy();
    // Envelope reported once, body carries the args for Resume.
    expect(envelopes.length).toBe(1);
    expect(JSON.parse(envelopes[0].body)).toEqual({
      input: ARGS.input,
      buyer: ARGS.buyer,
      tone: ARGS.tone,
    });
    // Phases progress through awaiting-signature → settling → done.
    expect(states).toEqual(['previewing', 'awaiting-signature', 'settling', 'done']);
  });

  test('emits client steps (build/dry-run/sign) then forwards stream steps', async () => {
    const steps: MintStep[] = [];
    const { deps: d } = deps(doneStream(), undefined, [], steps);
    await runMint(ARGS, d);

    const seq = steps.map((s) => `${s.id}:${s.status}`);
    // Client-synthesized steps, in order, before the stream's first event.
    expect(seq.slice(0, 6)).toEqual([
      'build:active',
      'build:done',
      'dry-run:active',
      'dry-run:done',
      'sign:active',
      'sign:done',
    ]);
    // Stream steps forwarded verbatim, including the terminal settle/memo sigs.
    expect(seq).toContain('verify:active');
    expect(seq).toContain('settle:done');
    expect(seq).toContain('memo:done');
    const settleDone = steps.find((s) => s.id === 'settle' && s.status === 'done');
    expect(settleDone?.sig).toBe(PAYMENT_SIG);
    const memoDone = steps.find((s) => s.id === 'memo' && s.status === 'done');
    expect(memoDone?.sig).toBe(MEMO_SIG);
  });

  test('handles partial chunks split mid-line / mid-UTF-8', async () => {
    // 7-byte chunks slice JSON lines (and multibyte runs) across reads.
    const { deps: d } = deps(doneStream(7));
    const result = await runMint(ARGS, d);
    expect(result).toEqual({
      ok: true,
      shareUrl: SHARE_URL,
      paymentSig: PAYMENT_SIG,
      memoSig: MEMO_SIG,
    });
  });

  test('user declines signature → rejected, no settle POST', async () => {
    const signTransaction = async (): Promise<VersionedTransaction> => {
      throw new Error('User rejected the request.');
    };
    const steps: MintStep[] = [];
    const { deps: d, calls } = deps(doneStream(), signTransaction, [], steps);

    const result = await runMint(ARGS, d);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('rejected');
    // Only the probe POST happened; never reached settle.
    expect(calls.length).toBe(1);
    expect(steps).toContainEqual({ id: 'build', status: 'error' });
  });

  test('insufficient USDC from wallet → insufficient-usdc', async () => {
    const signTransaction = async (): Promise<VersionedTransaction> => {
      throw new Error('insufficient funds for transfer');
    };
    const { deps: d } = deps(doneStream(), signTransaction);
    const result = await runMint(ARGS, d);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('insufficient-usdc');
  });

  test('error event WITH paymentSig → resumable (carries paymentSig)', async () => {
    const stream = ndjsonResponse([
      { t: 'step', id: 'verify', status: 'active' },
      { t: 'step', id: 'verify', status: 'done' },
      { t: 'step', id: 'settle', status: 'active' },
      { t: 'step', id: 'settle', status: 'done', sig: PAYMENT_SIG },
      { t: 'step', id: 'confirm', status: 'active' },
      {
        t: 'error',
        id: 'confirm',
        kind: 'blockhash-expired',
        reason: 'blockhash not found',
        paymentSig: PAYMENT_SIG,
      },
    ]);
    const steps: MintStep[] = [];
    const { deps: d } = deps(stream, undefined, [], steps);
    const result = await runMint(ARGS, d);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('blockhash-expired');
      expect(result.error.paymentSig).toBe(PAYMENT_SIG);
    }
    // The failing step is marked error in the model.
    expect(steps).toContainEqual({ id: 'confirm', status: 'error' });
  });

  test('error event WITHOUT paymentSig → not resumable', async () => {
    const stream = ndjsonResponse([
      { t: 'step', id: 'verify', status: 'active' },
      {
        t: 'error',
        id: 'verify',
        kind: 'facilitator-refundable',
        reason: 'facilitator verify: nope',
      },
    ]);
    const result = await runMint(ARGS, deps(stream).deps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('facilitator-refundable');
      expect(result.error.paymentSig).toBeUndefined();
    }
  });

  test('blockhash error event → blockhash-expired', async () => {
    const stream = ndjsonResponse([
      {
        t: 'error',
        id: 'settle',
        kind: 'blockhash-expired',
        reason: 'blockhash not found',
      },
    ]);
    const result = await runMint(ARGS, deps(stream).deps);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('blockhash-expired');
  });

  test('stream closes without terminal event → generic', async () => {
    const stream = ndjsonResponse([
      { t: 'step', id: 'verify', status: 'active' },
      { t: 'step', id: 'verify', status: 'done' },
    ]);
    const result = await runMint(ARGS, deps(stream).deps);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('generic');
  });

  test('with a brief: sends `brief` in the body and forwards the server `direct` step', async () => {
    // A done stream that includes the brief-only `direct` step (server emits it
    // after confirm, before facts).
    const stream = ndjsonResponse([
      { t: 'step', id: 'verify', status: 'active' },
      { t: 'step', id: 'verify', status: 'done' },
      { t: 'step', id: 'settle', status: 'active' },
      { t: 'step', id: 'settle', status: 'done', sig: PAYMENT_SIG },
      { t: 'step', id: 'confirm', status: 'active' },
      { t: 'step', id: 'confirm', status: 'done' },
      { t: 'step', id: 'direct', status: 'active' },
      { t: 'step', id: 'direct', status: 'done' },
      { t: 'step', id: 'facts', status: 'active' },
      { t: 'step', id: 'facts', status: 'done' },
      { t: 'step', id: 'write', status: 'active' },
      { t: 'step', id: 'write', status: 'done' },
      { t: 'step', id: 'paint', status: 'active' },
      { t: 'step', id: 'paint', status: 'done' },
      { t: 'step', id: 'save', status: 'active' },
      { t: 'step', id: 'save', status: 'done' },
      { t: 'step', id: 'memo', status: 'active' },
      { t: 'step', id: 'memo', status: 'done', sig: MEMO_SIG },
      { t: 'done', shareUrl: SHARE_URL, paymentSig: PAYMENT_SIG, memoSig: MEMO_SIG },
    ]);
    const steps: MintStep[] = [];
    const { deps: d, calls } = deps(stream, undefined, [], steps);

    const result = await runMint({ ...ARGS, brief: 'make it tragic' }, d);

    expect(result.ok).toBe(true);
    // The settle POST body carries the brief verbatim.
    const settleBody = JSON.parse(String(calls[1]?.init?.body));
    expect(settleBody.brief).toBe('make it tragic');
    // The server `direct` step is forwarded verbatim (client never synthesizes it).
    const seq = steps.map((s) => `${s.id}:${s.status}`);
    expect(seq).toContain('direct:active');
    expect(seq).toContain('direct:done');
  });

  test('whitespace-only brief is treated as no brief → omitted from the body', async () => {
    const { deps: d, calls } = deps(doneStream());
    const result = await runMint({ ...ARGS, brief: '   ' }, d);

    expect(result.ok).toBe(true);
    const settleBody = JSON.parse(String(calls[1]?.init?.body));
    expect('brief' in settleBody).toBe(false);
  });

  test('no brief argument → no `brief` key in the body (briefless mint unchanged)', async () => {
    const { deps: d, calls } = deps(doneStream());
    const result = await runMint(ARGS, d);

    expect(result.ok).toBe(true);
    const settleBody = JSON.parse(String(calls[1]?.init?.body));
    expect('brief' in settleBody).toBe(false);
  });

  test('non-402 probe response → generic', async () => {
    // Force the probe itself to be a 200 (unexpected) by making fetch ignore payment.
    const doFetch = (async () => jsonResponse(200, {})) as unknown as typeof fetch;
    const result = await runMint(ARGS, {
      fetch: doFetch,
      signTransaction: makeSigner().signTransaction,
      buyerPubkey: BUYER,
      connection,
      endpoint: ENDPOINT,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('generic');
  });
});
