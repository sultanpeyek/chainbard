import { describe, expect, test } from 'bun:test';
import { kindFromReason, verifyFailureKind } from '@/lib/mint-error-kind';

describe('verifyFailureKind', () => {
  // A pre-settle /verify failure means the buyer's transfer was never broadcast,
  // so nothing was charged. It must never be reported as refundable, or the UI
  // shows the misleading "Payment sent… Resume" copy for an uncharged buyer.
  test('the TokenLedger verify rejection is uncharged → generic, not refundable', () => {
    const kind = verifyFailureKind(
      'facilitator verify: TokenLedger account must match transfer source',
    );
    expect(kind).toBe('generic');
    expect(kind).not.toBe('facilitator-refundable');
  });

  test('still disambiguates blockhash and insufficient-USDC reasons', () => {
    expect(verifyFailureKind('facilitator verify: blockhash not found')).toBe('blockhash-expired');
    expect(verifyFailureKind('facilitator verify: insufficient funds for transfer')).toBe(
      'insufficient-usdc',
    );
  });
});

describe('kindFromReason', () => {
  test('refundable=true short-circuits to facilitator-refundable', () => {
    expect(kindFromReason('anything at all', true)).toBe('facilitator-refundable');
  });

  test('refundable=false classifies by reason text', () => {
    expect(kindFromReason('blockhash expired', false)).toBe('blockhash-expired');
    expect(kindFromReason('insufficient balance', false)).toBe('insufficient-usdc');
    expect(kindFromReason('TokenLedger account must match transfer source', false)).toBe('generic');
  });
});
