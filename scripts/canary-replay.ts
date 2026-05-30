/**
 * Replay a previously-paid mint after a retryable failure (e.g. RPC 429).
 *
 * Uses the same X-Payment envelope shape and same body. Server dedupe
 * prevents double-charge — verifier matches `paymentSig` to the existing
 * paid context and resumes orchestration.
 *
 * Usage:
 *   bun run scripts/canary-replay.ts <paymentSig> <input> [--retries N] [--delay MS]
 */

import { mintEndpoint } from '../src/env/cli';

const args = process.argv.slice(2);
const flagIdx = (name: string) => args.indexOf(name);
const RETRIES = (() => {
  const i = flagIdx('--retries');
  return i > -1 ? Math.max(1, Number(args[i + 1] ?? '6')) : 6;
})();
const DELAY_MS = (() => {
  const i = flagIdx('--delay');
  return i > -1 ? Math.max(1000, Number(args[i + 1] ?? '15000')) : 15_000;
})();

const positional = args
  .filter((a) => !a.startsWith('--'))
  .filter((_a, i, all) => {
    const prev = all[i - 1];
    return prev !== '--retries' && prev !== '--delay';
  });
const [paymentSig, input] = positional;
if (!paymentSig || !input) {
  console.error(
    'Usage: bun run scripts/canary-replay.ts <paymentSig> <input> [--retries N] [--delay MS]',
  );
  process.exit(1);
}
const buyer = input; // canary: buyer == input

const ENDPOINT = mintEndpoint();

const envelope = {
  x402Version: 2,
  scheme: 'exact',
  network: 'solana',
  payload: { signature: paymentSig },
};
const xPayment = Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64');

async function attempt(n: number): Promise<boolean> {
  console.log(`─── Attempt ${n}/${RETRIES} ───────────────────────────────`);
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Payment': xPayment },
    body: JSON.stringify({ input, buyer }),
  });
  const text = await res.text();
  let data: {
    ok?: boolean;
    state?: string;
    paymentSig?: string;
    memoSig?: string;
    shareUrl?: string;
    reason?: string;
  };
  try {
    data = JSON.parse(text);
  } catch {
    data = { reason: text.slice(0, 500) };
  }
  console.log(`  Status: ${res.status}`);
  console.log(`  Body:   ${JSON.stringify(data, null, 2)}`);

  if (res.status === 200 && data.ok) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  ✅ Canary mint complete.');
    console.log(`  Payment:  https://solscan.io/tx/${data.paymentSig}`);
    if (data.memoSig) console.log(`  Memo:     https://solscan.io/tx/${data.memoSig}`);
    console.log(`  Share:    https://chainbard.vercel.app${data.shareUrl}`);
    return true;
  }
  // Terminal-stop only on definitive verdict from server. Unknown body (e.g.
  // transient 500 with empty JSON, cold-start crash) is treated as retryable
  // so we don't bail prematurely on a paid sig.
  if (data.state === 'refundable' || data.state === 'fatal') {
    console.error(`✗ Non-retryable state: ${data.state}`);
    process.exit(1);
  }
  return false;
}

(async () => {
  for (let i = 1; i <= RETRIES; i++) {
    if (await attempt(i)) return;
    if (i < RETRIES) {
      console.log(`  Sleeping ${DELAY_MS}ms before next attempt…\n`);
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }
  console.error(`✗ Exhausted ${RETRIES} retries; mint still retryable.`);
  process.exit(2);
})().catch((err) => {
  console.error('✗ Fatal:', err);
  process.exit(1);
});
