// ── Satisfy app-wide env validation ────────────────────────────────────────────
process.env.ACE_API_KEY ??= 'test';
process.env.AGENT_SECRET_KEY_BASE58 ??= 'test';
process.env.CRON_SECRET ??= 'test';
process.env.DATABASE_URL ??= 'https://test.invalid/db';
process.env.DEMO_SECRET ??= 'test';

import { describe, expect, test } from 'bun:test';
import { buildAgentSolanaWalletAdapter } from '@/cron-adapters';
import { FundsExhaustedError } from '@/treasury';

// The adapter only calls tx.recentBlockhash=/lastValidBlockHeight=/sign()/serialize()
// and connection.getLatestBlockhash/sendRawTransaction/getSignatureStatus — all
// faked here so no real RPC or keypair is touched.
const fakeAgent = {
  publicKey: { toBase58: () => 'AGENTPUBKEY' },
} as unknown as import('@solana/web3.js').Keypair;

function makeFakeTx() {
  return {
    recentBlockhash: 'FOREIGN_BLOCKHASH', // what the x402 client set from a foreign rpc
    lastValidBlockHeight: undefined as number | undefined,
    feePayer: 'FEEPAYER',
    signed: false,
    blockhashAtSign: undefined as string | undefined,
    sign() {
      this.blockhashAtSign = this.recentBlockhash;
      this.signed = true;
    },
    serialize() {
      if (!this.signed) throw new Error('serialize before sign');
      return Buffer.from('rawtx');
    },
  };
}

function makeConn(statuses: Array<{ err: unknown; confirmationStatus?: string | null }>) {
  let i = 0;
  let sends = 0;
  const conn = {
    getLatestBlockhash: async () => ({ blockhash: 'FRESH_FROM_SYNAPSE', lastValidBlockHeight: 123 }),
    sendRawTransaction: async () => {
      sends++;
      return 'SIG123';
    },
    getSignatureStatus: async () => ({ value: statuses[Math.min(i++, statuses.length - 1)] }),
    get sendCount() {
      return sends;
    },
  };
  return conn as unknown as import('@solana/web3.js').Connection & { sendCount: number };
}

describe('buildAgentSolanaWalletAdapter — settlement reliability (Synapse blockhash race fix)', () => {
  test('re-anchors the blockhash to the broadcast node before signing, then settles', async () => {
    const tx = makeFakeTx();
    const conn = makeConn([{ err: null, confirmationStatus: 'confirmed' }]);
    const settled: string[] = [];
    const adapter = buildAgentSolanaWalletAdapter(fakeAgent, conn, (s) => settled.push(s));

    const sig = await adapter.signAndSendTransaction(tx);

    expect(sig).toBe('SIG123');
    // Fresh blockhash from the SAME node we broadcast through replaced the foreign one…
    expect(tx.recentBlockhash).toBe('FRESH_FROM_SYNAPSE');
    expect(tx.lastValidBlockHeight).toBe(123);
    // …and it was set BEFORE the signature was produced (the sig must cover it).
    expect(tx.blockhashAtSign).toBe('FRESH_FROM_SYNAPSE');
    // onSettle fires exactly once with the confirmed sig.
    expect(settled).toEqual(['SIG123']);
  });

  test('throws typed FundsExhaustedError on SPL InsufficientFunds (Custom code 1)', async () => {
    const tx = makeFakeTx();
    const conn = makeConn([{ err: { InstructionError: [0, { Custom: 1 }] } }]);
    const settled: string[] = [];
    const adapter = buildAgentSolanaWalletAdapter(fakeAgent, conn, (s) => settled.push(s));

    await expect(adapter.signAndSendTransaction(tx)).rejects.toBeInstanceOf(FundsExhaustedError);
    expect(settled).toEqual([]); // never settled
  });

  test('a non-funds on-chain error throws a plain Error, not FundsExhaustedError', async () => {
    const tx = makeFakeTx();
    const conn = makeConn([{ err: { InstructionError: [0, { Custom: 6001 }] } }]);
    const adapter = buildAgentSolanaWalletAdapter(fakeAgent, conn);

    const err = await adapter.signAndSendTransaction(tx).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(FundsExhaustedError);
    expect((err as Error).message).toContain('failed on-chain');
  });
});

describe('buildAgentSolanaWalletAdapter — solana_send fallback (Synapse-first, no double-spend)', () => {
  test('engages solana_send when Synapse never confirms, and settles via it', async () => {
    const tx = makeFakeTx();
    // Synapse: broadcasts fine but NEVER reaches a confirmed status.
    const synapse = makeConn([{ err: null, confirmationStatus: 'processed' }]);
    // solana_send: reports confirmed → it's the one that lands the settlement.
    const send = makeConn([{ err: null, confirmationStatus: 'confirmed' }]);
    const settled: string[] = [];
    // primaryMs:0 engages the fallback on the first poll so the test is fast.
    const adapter = buildAgentSolanaWalletAdapter(fakeAgent, synapse, (s) => settled.push(s), {
      fallbackConnection: send,
      primaryMs: 0,
      totalMs: 8_000,
    });

    const sig = await adapter.signAndSendTransaction(tx);

    expect(sig).toBe('SIG123');
    // Synapse got the FIRST broadcast (execution/compliance)…
    expect(synapse.sendCount).toBeGreaterThanOrEqual(1);
    // …and solana_send was engaged to actually land it.
    expect(send.sendCount).toBeGreaterThanOrEqual(1);
    expect(settled).toEqual(['SIG123']);
  });

  test('falls back immediately if the Synapse broadcast itself throws', async () => {
    const tx = makeFakeTx();
    const synapse = {
      getLatestBlockhash: async () => ({ blockhash: 'FRESH', lastValidBlockHeight: 1 }),
      sendRawTransaction: async () => {
        throw new Error('synapse node rejected send');
      },
      getSignatureStatus: async () => ({ value: { err: null, confirmationStatus: 'processed' } }),
    } as unknown as import('@solana/web3.js').Connection;
    const send = makeConn([{ err: null, confirmationStatus: 'confirmed' }]);
    const settled: string[] = [];
    const adapter = buildAgentSolanaWalletAdapter(fakeAgent, synapse, (s) => settled.push(s), {
      fallbackConnection: send,
      primaryMs: 0,
      totalMs: 8_000,
    });

    const sig = await adapter.signAndSendTransaction(tx);
    expect(sig).toBe('SIG123'); // sig comes from the fallback send
    expect(settled).toEqual(['SIG123']);
  });

  test('with NO fallback configured, a Synapse send error is fatal', async () => {
    const tx = makeFakeTx();
    const synapse = {
      getLatestBlockhash: async () => ({ blockhash: 'FRESH', lastValidBlockHeight: 1 }),
      sendRawTransaction: async () => {
        throw new Error('synapse node rejected send');
      },
      getSignatureStatus: async () => ({ value: null }),
    } as unknown as import('@solana/web3.js').Connection;
    const adapter = buildAgentSolanaWalletAdapter(fakeAgent, synapse);

    await expect(adapter.signAndSendTransaction(tx)).rejects.toThrow('no fallback configured');
  });
});
