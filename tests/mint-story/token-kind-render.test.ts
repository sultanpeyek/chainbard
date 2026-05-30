/**
 * Token kind is no longer rejected by the mint route's kind guard (ADR 0011).
 *
 * The earlier "token render deferred (#82)" 400 short-circuit was removed: token
 * now routes into the same render path as wallet/tx/nft. This test mocks
 * detectKind to yield { kind: 'token', mint: '...' } and asserts the route does
 * NOT short-circuit on the deferred guard.
 *
 * The stream commits 200 only after settle, and verify fails against a dummy
 * facilitator, so a full end-to-end assertion is infeasible here. The decisive
 * invariant is the negative one: the response is either not a 400, or — if it is
 * a 400 — its body does not mention the removed deferred guard.
 */
import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';

// ── Satisfy app-wide env validation ────────────────────────────────────────────
// Importing the route transitively loads '@/env' (index.ts), which validates the
// required server secrets via @t3-oss/env-core and throws if any are undefined.
// Dummy values are enough to let the module import; the test never touches a real
// payment, db, or keypair.
process.env.ACE_API_KEY ??= 'test';
process.env.AGENT_SECRET_KEY_BASE58 ??= 'test';
process.env.CRON_SECRET ??= 'test';
process.env.DATABASE_URL ??= 'https://test.invalid/db';
process.env.DEMO_SECRET ??= 'test';

// ── Mock kind-detection to yield a token result ────────────────────────────────
// Must be registered before the route module is imported.
//
// `mock.module` is process-global in bun and leaks across test files, so capture
// the real `detectKind` first and restore it in afterAll — otherwise other files
// that import '@/kind-detector' (e.g. preview-facts) would see this token stub.

const realDetectKind = (await import('@/kind-detector')).detectKind;

mock.module('@/kind-detector', () => ({
  detectKind: async () => ({ kind: 'token', mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' }),
}));

afterAll(() => {
  mock.module('@/kind-detector', () => ({ detectKind: realDetectKind }));
});

mock.module('@/kind-rpc', () => ({
  makeKindRpc: () => ({ rpc: {}, assetLookup: {} }),
}));

// ── Load POST handler after mocks are registered ───────────────────────────────

let POST: (req: Request) => Promise<Response>;

beforeAll(async () => {
  const mod = await import('@/app/api/mint/story/route');
  POST = (mod as unknown as { POST: (req: Request) => Promise<Response> }).POST;
});

// ── Helper ─────────────────────────────────────────────────────────────────────

function makeTokenMintRequest(mint = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'): Request {
  return new Request('http://localhost/api/mint/story', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Minimal valid x-payment header: base64-encoded JSON envelope
      'x-payment': btoa(
        JSON.stringify({ scheme: 'exact', network: 'solana', payload: { transaction: 'dummyB64' } }),
      ),
    },
    body: JSON.stringify({
      input: mint,
      buyer: '4Nd1mBQtrMJVYVfKf2PX59QBBVVQksPKYWme6bwgkH7m',
    }),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('mint route — token kind render (ADR 0011)', () => {
  test('does not short-circuit on the removed deferred guard', async () => {
    const res = await POST(makeTokenMintRequest());
    // Either the route proceeds past the kind guard (status !== 400), or it
    // fails downstream — but never with the removed "token render deferred" 400.
    const passedKindGuard = res.status !== 400 || !(await res.clone().text()).includes('deferred');
    expect(passedKindGuard).toBe(true);
  });

  test('error body never mentions the removed deferred guard or #82', async () => {
    const res = await POST(makeTokenMintRequest());
    let error = '';
    try {
      const body = (await res.clone().json()) as { error?: string };
      error = body.error ?? '';
    } catch {
      // Non-JSON (e.g. a streaming 200) body — nothing to assert about deferral.
      error = '';
    }
    expect(error).not.toContain('token render deferred');
    expect(error).not.toContain('#82');
  });
});
