import { describe, expect, test } from 'bun:test';
import { solscanTxUrl, solscanUrl } from '@/lib/explorer';

describe('solscanTxUrl', () => {
  test('builds a mainnet solscan tx link', () => {
    expect(solscanTxUrl('5abc')).toBe('https://solscan.io/tx/5abc');
  });
});

describe('solscanUrl', () => {
  test('wallets resolve to /account', () => {
    expect(solscanUrl('w4llet', 'wallet')).toBe('https://solscan.io/account/w4llet');
  });
  test('txs resolve to /tx', () => {
    expect(solscanUrl('5abc', 'tx')).toBe('https://solscan.io/tx/5abc');
  });
  test('nfts resolve to /token (SPL mint)', () => {
    expect(solscanUrl('m1nt', 'nft')).toBe('https://solscan.io/token/m1nt');
  });
  test('tokens resolve to /token', () => {
    expect(solscanUrl('m1nt', 'token')).toBe('https://solscan.io/token/m1nt');
  });
});
