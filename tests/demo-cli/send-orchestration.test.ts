import { describe, expect, test } from 'bun:test';
import {
  buildFundingPlan,
  buildMintHeaders,
  buildPaymentEnvelope,
  resolveFundingNeeds,
  resolveImagePolicy,
  resolveRecoverDecision,
} from '@/modules/demo-cli';

describe('resolveFundingNeeds', () => {
  const plan = buildFundingPlan(0.3); // gasSol 0.005, usdcAtomic 300000

  test('funds both when buyer is empty', () => {
    const needs = resolveFundingNeeds({ buyerLamports: 0, buyerUsdcAtomic: BigInt(0), plan });
    expect(needs.needSol).toBe(true);
    expect(needs.needUsdc).toBe(true);
  });

  test('idempotent: skips both when buyer already funded', () => {
    const needs = resolveFundingNeeds({
      buyerLamports: 5_000_000, // == 0.005 SOL
      buyerUsdcAtomic: BigInt(300_000),
      plan,
    });
    expect(needs.needSol).toBe(false);
    expect(needs.needUsdc).toBe(false);
  });

  test('funds only the side that is short', () => {
    const needs = resolveFundingNeeds({
      buyerLamports: 10_000_000, // ample SOL
      buyerUsdcAtomic: BigInt(100_000), // short USDC
      plan,
    });
    expect(needs.needSol).toBe(false);
    expect(needs.needUsdc).toBe(true);
  });

  test('nothing needed implies no funding tx', () => {
    const needs = resolveFundingNeeds({
      buyerLamports: 6_000_000,
      buyerUsdcAtomic: BigInt(400_000),
      plan,
    });
    expect(needs.needSol || needs.needUsdc).toBe(false);
  });
});

describe('buildPaymentEnvelope', () => {
  test('produces the base64 x402 envelope carrying the partial-signed tx', () => {
    const header = buildPaymentEnvelope('VHhCYXNlNjQxMTE=');
    const decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
    expect(decoded).toEqual({
      x402Version: 2,
      scheme: 'exact',
      network: 'solana',
      payload: { transaction: 'VHhCYXNlNjQxMTE=' },
    });
  });
});

describe('buildMintHeaders', () => {
  test('always carries Content-Type and X-Payment', () => {
    const headers = buildMintHeaders({ paymentHeader: 'abc', demoKey: undefined });
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['X-Payment']).toBe('abc');
    expect('x-demo-key' in headers).toBe(false);
  });

  test('attaches x-demo-key when a demo secret is present (=> provenance demo)', () => {
    const headers = buildMintHeaders({ paymentHeader: 'abc', demoKey: 'sekret' });
    expect(headers['x-demo-key']).toBe('sekret');
  });

  test('omits x-demo-key for empty string secret', () => {
    const headers = buildMintHeaders({ paymentHeader: 'abc', demoKey: '' });
    expect('x-demo-key' in headers).toBe(false);
  });
});

describe('resolveImagePolicy', () => {
  test('local always uses placeholder (free, no ACE image spend)', () => {
    expect(resolveImagePolicy({ target: 'local', placeholder: false })).toEqual({
      skipImage: true,
      expectPlaceholder: true,
    });
    expect(resolveImagePolicy({ target: 'local', placeholder: true })).toEqual({
      skipImage: true,
      expectPlaceholder: true,
    });
  });

  test('prod renders real Midjourney by default', () => {
    expect(resolveImagePolicy({ target: 'prod', placeholder: false })).toEqual({
      skipImage: false,
      expectPlaceholder: false,
    });
  });

  test('prod --placeholder forces skipImage', () => {
    expect(resolveImagePolicy({ target: 'prod', placeholder: true })).toEqual({
      skipImage: true,
      expectPlaceholder: true,
    });
  });
});

describe('resolveRecoverDecision', () => {
  const feeReserve = 5_000; // lamports kept for the sweep tx fee

  test('sweeps leftover SOL above the fee reserve by default', () => {
    const d = resolveRecoverDecision({
      noRecover: false,
      buyerLamports: 3_000_000,
      feeReserveLamports: feeReserve,
    });
    expect(d.shouldRecover).toBe(true);
    expect(d.sweepLamports).toBe(3_000_000 - feeReserve);
  });

  test('--no-recover parks the funds (no sweep)', () => {
    const d = resolveRecoverDecision({
      noRecover: true,
      buyerLamports: 3_000_000,
      feeReserveLamports: feeReserve,
    });
    expect(d.shouldRecover).toBe(false);
    expect(d.sweepLamports).toBe(0);
  });

  test('does not sweep when balance is at/below the fee reserve (dust)', () => {
    const d = resolveRecoverDecision({
      noRecover: false,
      buyerLamports: feeReserve,
      feeReserveLamports: feeReserve,
    });
    expect(d.shouldRecover).toBe(false);
    expect(d.sweepLamports).toBe(0);
  });
});
