import { describe, expect, test } from 'bun:test';
import {
  createX402Verifier,
  type DedupeStore,
  type VerifierRpc,
  type VerifierTx,
} from '@/modules/x402-verifier';

const BUYER = 'B1aLAAe4vW8nSQCetXnYqJfRxzTjnbooasVZjUUtsKf';
const PAY_TO = '9cssRtj1tpo8juYMKVw4BLonEXnSH2e6bfc9Qp88fN48';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const OTHER_MINT = 'So11111111111111111111111111111111111111112';
const DEST_ATA = 'DESTAtA1111111111111111111111111111111111111';
const OTHER_ATA = 'OTHER1111111111111111111111111111111111111';
const SOURCE_ATA = 'SRC111111111111111111111111111111111111111';
const SIG = 'sig_valid_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

const PRICE = BigInt(300_000); // 0.30 USDC

function makeTx(partial: Partial<VerifierTx>): VerifierTx {
  return {
    slot: 100,
    err: null,
    tokenTransfers: [
      {
        source: SOURCE_ATA,
        destination: DEST_ATA,
        mint: USDC,
        amount: PRICE,
        authority: BUYER,
      },
    ],
    ...partial,
  };
}

function makeRpc(tx: VerifierTx | null, currentSlot = 110): VerifierRpc {
  return {
    async getTransaction() {
      return tx;
    },
    async getSlot() {
      return currentSlot;
    },
  };
}

function makeDedupe(): DedupeStore {
  const seen = new Set<string>();
  return {
    async seen(sig) {
      return seen.has(sig);
    },
    async mark(sig) {
      seen.add(sig);
    },
  };
}

const args = {
  signature: SIG,
  expectedBuyer: BUYER,
  expectedMint: USDC,
  expectedAmount: PRICE,
  expectedDestAta: DEST_ATA,
};

describe('createX402Verifier', () => {
  test('valid fixture passes', async () => {
    const verifier = createX402Verifier({
      rpc: makeRpc(makeTx({})),
      dedupe: makeDedupe(),
      freshnessSlots: 150,
    });
    const result = await verifier.verifyPayment(args);
    expect(result).toEqual({ ok: true });
  });

  test('verifyPayment success does not auto-mark (deferred to markUsed)', async () => {
    const dedupe = makeDedupe();
    const verifier = createX402Verifier({
      rpc: makeRpc(makeTx({})),
      dedupe,
      freshnessSlots: 150,
    });
    await verifier.verifyPayment(args);
    expect(await dedupe.seen(SIG)).toBe(false);
    await verifier.markUsed(SIG);
    expect(await dedupe.seen(SIG)).toBe(true);
  });

  test('rejects when tx not found', async () => {
    const verifier = createX402Verifier({
      rpc: makeRpc(null),
      dedupe: makeDedupe(),
      freshnessSlots: 150,
    });
    const result = await verifier.verifyPayment(args);
    expect(result).toEqual({ ok: false, reason: 'tx-not-found' });
  });

  test('rejects when tx failed on-chain', async () => {
    const verifier = createX402Verifier({
      rpc: makeRpc(makeTx({ err: { InstructionError: [0, 'Custom'] } })),
      dedupe: makeDedupe(),
      freshnessSlots: 150,
    });
    const result = await verifier.verifyPayment(args);
    expect(result).toEqual({ ok: false, reason: 'tx-failed' });
  });

  test('rejects wrong-amount (underpaid)', async () => {
    const verifier = createX402Verifier({
      rpc: makeRpc(
        makeTx({
          tokenTransfers: [
            {
              source: SOURCE_ATA,
              destination: DEST_ATA,
              mint: USDC,
              amount: PRICE - BigInt(1),
              authority: BUYER,
            },
          ],
        }),
      ),
      dedupe: makeDedupe(),
      freshnessSlots: 150,
    });
    const result = await verifier.verifyPayment(args);
    expect(result).toEqual({ ok: false, reason: 'wrong-amount' });
  });

  test('rejects wrong-mint', async () => {
    const verifier = createX402Verifier({
      rpc: makeRpc(
        makeTx({
          tokenTransfers: [
            {
              source: SOURCE_ATA,
              destination: DEST_ATA,
              mint: OTHER_MINT,
              amount: PRICE,
              authority: BUYER,
            },
          ],
        }),
      ),
      dedupe: makeDedupe(),
      freshnessSlots: 150,
    });
    const result = await verifier.verifyPayment(args);
    expect(result).toEqual({ ok: false, reason: 'wrong-mint' });
  });

  test('rejects wrong-destination', async () => {
    const verifier = createX402Verifier({
      rpc: makeRpc(
        makeTx({
          tokenTransfers: [
            {
              source: SOURCE_ATA,
              destination: OTHER_ATA,
              mint: USDC,
              amount: PRICE,
              authority: BUYER,
            },
          ],
        }),
      ),
      dedupe: makeDedupe(),
      freshnessSlots: 150,
    });
    const result = await verifier.verifyPayment(args);
    expect(result).toEqual({ ok: false, reason: 'wrong-destination' });
  });

  test('rejects stale-slot when tx older than freshnessSlots', async () => {
    const verifier = createX402Verifier({
      rpc: makeRpc(makeTx({ slot: 100 }), 100 + 200),
      dedupe: makeDedupe(),
      freshnessSlots: 150,
    });
    const result = await verifier.verifyPayment(args);
    expect(result).toEqual({ ok: false, reason: 'stale-slot' });
  });

  test('rejects duplicate-sig', async () => {
    const dedupe = makeDedupe();
    await dedupe.mark(SIG);
    const verifier = createX402Verifier({
      rpc: makeRpc(makeTx({})),
      dedupe,
      freshnessSlots: 150,
    });
    const result = await verifier.verifyPayment(args);
    expect(result).toEqual({ ok: false, reason: 'duplicate-sig' });
  });

  test('rejects when no matching token transfer (wrong authority)', async () => {
    const verifier = createX402Verifier({
      rpc: makeRpc(
        makeTx({
          tokenTransfers: [
            {
              source: SOURCE_ATA,
              destination: DEST_ATA,
              mint: USDC,
              amount: PRICE,
              authority: 'someoneElse111111111111111111111111111111111',
            },
          ],
        }),
      ),
      dedupe: makeDedupe(),
      freshnessSlots: 150,
    });
    const result = await verifier.verifyPayment(args);
    expect(result).toEqual({ ok: false, reason: 'wrong-buyer' });
  });

  test('accepts overpayment (amount >= expected)', async () => {
    const verifier = createX402Verifier({
      rpc: makeRpc(
        makeTx({
          tokenTransfers: [
            {
              source: SOURCE_ATA,
              destination: DEST_ATA,
              mint: USDC,
              amount: PRICE + BigInt(1),
              authority: BUYER,
            },
          ],
        }),
      ),
      dedupe: makeDedupe(),
      freshnessSlots: 150,
    });
    const result = await verifier.verifyPayment(args);
    expect(result).toEqual({ ok: true });
  });

  test('does not mark sig as seen on failure', async () => {
    const dedupe = makeDedupe();
    const verifier = createX402Verifier({
      rpc: makeRpc(null),
      dedupe,
      freshnessSlots: 150,
    });
    await verifier.verifyPayment(args);
    expect(await dedupe.seen(SIG)).toBe(false);
  });
});
