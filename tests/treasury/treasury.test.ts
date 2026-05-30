import { describe, expect, test } from 'bun:test';
import { FundsExhaustedError, isFundsExhausted } from '@/treasury';

describe('isFundsExhausted', () => {
  test('FundsExhaustedError by name', () => {
    expect(isFundsExhausted(new FundsExhaustedError('treasury below floor'))).toBe(true);
  });

  test('InsufficientBalanceError by name', () => {
    const err = new Error('something');
    err.name = 'InsufficientBalanceError';
    expect(isFundsExhausted(err)).toBe(true);
  });

  test('ResourceDisabledError by name', () => {
    const err = new Error('disabled');
    err.name = 'ResourceDisabledError';
    expect(isFundsExhausted(err)).toBe(true);
  });

  test('message: insufficient funds / lamports / balance / usdc / sol', () => {
    expect(isFundsExhausted(new Error('Insufficient funds for transaction'))).toBe(true);
    expect(isFundsExhausted(new Error('insufficient lamports 0'))).toBe(true);
    expect(isFundsExhausted(new Error('Insufficient balance'))).toBe(true);
    expect(isFundsExhausted(new Error('insufficient USDC to pay'))).toBe(true);
    expect(isFundsExhausted(new Error('insufficient SOL for fees'))).toBe(true);
  });

  test('message: custom program error: 0x1', () => {
    expect(
      isFundsExhausted(new Error('Transaction failed: custom program error: 0x1')),
    ).toBe(true);
  });

  test('message: bare 0x1 token error', () => {
    expect(isFundsExhausted(new Error('Error processing Instruction 0: 0x1'))).toBe(true);
  });

  test('message: attempt to debit / debit an account but found no record', () => {
    expect(isFundsExhausted(new Error('Attempt to debit an account'))).toBe(true);
    expect(
      isFundsExhausted(new Error('Attempt to debit an account but found no record of a prior credit')),
    ).toBe(true);
  });

  test('message: InsufficientFundsForRent', () => {
    expect(isFundsExhausted(new Error('InsufficientFundsForRent { needed: 890880 }'))).toBe(
      true,
    );
  });

  test('message: no record of a prior credit', () => {
    expect(isFundsExhausted(new Error('no record of a prior credit'))).toBe(true);
  });

  test('walks err.cause chain (one level)', () => {
    const root = new Error('insufficient lamports');
    const wrapper = new Error('x402 payment broadcast failed', { cause: root });
    expect(isFundsExhausted(wrapper)).toBe(true);
  });

  test('walks deep err.cause chain (multi level)', () => {
    const root = new FundsExhaustedError('dry treasury');
    const mid = new Error('send failed', { cause: root });
    const top = new Error('tick failed', { cause: mid });
    expect(isFundsExhausted(top)).toBe(true);
  });

  test('plain string error matches by pattern', () => {
    expect(isFundsExhausted('Insufficient funds')).toBe(true);
  });

  test('non-exhaustion error returns false', () => {
    expect(isFundsExhausted(new Error('rate limited'))).toBe(false);
    expect(isFundsExhausted(new Error('502 bad gateway'))).toBe(false);
  });

  test('unrelated cause chain returns false', () => {
    const root = new Error('timeout');
    const top = new Error('render failed', { cause: root });
    expect(isFundsExhausted(top)).toBe(false);
  });

  test('non-error values return false', () => {
    expect(isFundsExhausted(undefined)).toBe(false);
    expect(isFundsExhausted(null)).toBe(false);
    expect(isFundsExhausted(42)).toBe(false);
    expect(isFundsExhausted({})).toBe(false);
  });

  test('cyclic cause chain does not loop forever', () => {
    const a = new Error('a') as Error & { cause?: unknown };
    const b = new Error('b') as Error & { cause?: unknown };
    a.cause = b;
    b.cause = a;
    expect(isFundsExhausted(a)).toBe(false);
  });

  // ── ADR 0015 regression: the USDC rail's dominant exhaustion shapes ──

  test('on-chain confirmed SPL InsufficientFunds JSON shape ({"Custom":1})', () => {
    // skipPreflight broadcast → confirm-loop throws JSON.stringify(value.err).
    const err = new Error(
      'x402 USDC transfer failed (insufficient funds): {"InstructionError":[2,{"Custom":1}]} (sig abc)',
    );
    expect(isFundsExhausted(err)).toBe(true);
  });

  test('SPL InstructionError InsufficientFunds string form', () => {
    expect(
      isFundsExhausted(new Error('failed: {"InstructionError":[1,"InsufficientFunds"]}')),
    ).toBe(true);
  });

  test('AceChatJsonError-style wrapper burying SDK error in cause1/cause2', () => {
    // The dominant paid path (chat) wraps the SDK error in non-standard cause
    // fields; isFundsExhausted must still find it.
    const sdkErr = new Error('balance exhausted');
    sdkErr.name = 'InsufficientBalanceError';
    const wrapper = new Error('aceChatJson failed twice') as Error & { cause2?: unknown };
    wrapper.name = 'AceChatJsonError';
    wrapper.cause2 = sdkErr;
    expect(isFundsExhausted(wrapper)).toBe(true);
  });

  test('AggregateError.errors are inspected', () => {
    const agg = new AggregateError(
      [new Error('timeout'), new Error('insufficient funds')],
      'all failed',
    );
    expect(isFundsExhausted(agg)).toBe(true);
  });
});
