// ── Satisfy app-wide env validation ────────────────────────────────────────────
process.env.ACE_API_KEY ??= 'test';
process.env.AGENT_SECRET_KEY_BASE58 ??= 'test';
process.env.CRON_SECRET ??= 'test';
process.env.DATABASE_URL ??= 'https://test.invalid/db';
process.env.DEMO_SECRET ??= 'test';

import { afterAll, describe, expect, mock, test } from 'bun:test';

// ── Capture the constructor args of the Ace SDK + x402 handler ───────────────────
// buildAgentX402Ace must wire the AGENT's x402 self-broadcast handler — NOT a
// bearer apiToken (ADR 0016 B). We mock both Ace packages to record what they're
// constructed with, then assert the buy-side rail is x402, not credit.
//
// mock.module is process-global in bun, so capture the real modules first and
// restore them in afterAll (re-mocking with the real impl) — otherwise a later
// test that constructs the real Ace SDK would see these stubs.

let aceCtorArgs: unknown = null;
let x402HandlerArgs: unknown = null;
let signAndSendWired = false;

const realSdk = await import('@acedatacloud/sdk');
const realX402 = await import('@acedatacloud/x402-client');

mock.module('@acedatacloud/sdk', () => ({
  AceDataCloud: class {
    constructor(args: unknown) {
      aceCtorArgs = args;
    }
  },
}));

mock.module('@acedatacloud/x402-client', () => ({
  createX402PaymentHandler: (args: { solanaWallet?: { signAndSendTransaction?: unknown } }) => {
    x402HandlerArgs = args;
    signAndSendWired = typeof args.solanaWallet?.signAndSendTransaction === 'function';
    return { __x402: true };
  },
}));

const { buildAgentX402Ace } = await import('@/cron-adapters');

afterAll(() => {
  mock.module('@acedatacloud/sdk', () => realSdk);
  mock.module('@acedatacloud/x402-client', () => realX402);
});

// Minimal Keypair/Connection stand-ins (buildAgentSolanaWalletAdapter only reads
// publicKey + sendRawTransaction/getSignatureStatus, none of which run here).
const fakeAgent = {
  publicKey: { toBase58: () => 'AGENTPUBKEY' },
} as unknown as import('@solana/web3.js').Keypair;
const fakeSend = {} as unknown as import('@solana/web3.js').Connection;

describe('buildAgentX402Ace — reactive buy-side is x402, not bearer (ADR 0016 B)', () => {
  test('constructs the Ace facade with an x402 paymentHandler, never an apiToken', async () => {
    await buildAgentX402Ace(fakeAgent, fakeSend);
    const args = aceCtorArgs as { paymentHandler?: unknown; apiToken?: unknown };
    expect(args.paymentHandler).toEqual({ __x402: true });
    // The bearer/credit path is gone — no apiToken is ever passed.
    expect(args.apiToken).toBeUndefined();
  });

  test('the x402 handler is driven by the agent self-broadcast wallet', async () => {
    await buildAgentX402Ace(fakeAgent, fakeSend);
    const args = x402HandlerArgs as { network?: string };
    expect(args.network).toBe('solana');
    expect(signAndSendWired).toBe(true);
  });
});
