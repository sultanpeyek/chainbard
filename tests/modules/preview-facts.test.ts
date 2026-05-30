import { describe, expect, test } from 'bun:test';
import bs58 from 'bs58';
import { type PreviewDeps, previewFacts } from '@/modules/preview-facts';

const SYSTEM_PROGRAM = '11111111111111111111111111111111';
const SPL_TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

const WALLET_FIXTURE = 'B1aLAAe4vW8nSQCetXnYqJfRxzTjnbooasVZjUUtsKf';
const TOKEN_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const NFT_MINT = 'BzG3LcMaskBearer4267xKqPnRvSwTzAa9BCdEfGhJk';
const TX_SIG = bs58.encode(new Uint8Array(64).fill(1));

// A deps stub that records which free lookups were invoked, so tests can
// assert the free path (no Ace anywhere by construction — PreviewDeps has no
// Ace member to inject) and that only the lookups a given kind needs ran.
function makeDeps(overrides: Partial<PreviewDeps> = {}): {
  deps: PreviewDeps;
  calls: Set<string>;
} {
  const calls = new Set<string>();
  const deps: PreviewDeps = {
    async getOwner(pubkey) {
      calls.add('getOwner');
      return overrides.getOwner ? overrides.getOwner(pubkey) : null;
    },
    async getBalance(pubkey) {
      calls.add('getBalance');
      return overrides.getBalance ? overrides.getBalance(pubkey) : 0;
    },
    async getTransactionCount(pubkey) {
      calls.add('getTransactionCount');
      return overrides.getTransactionCount ? overrides.getTransactionCount(pubkey) : 0;
    },
    async getTransaction(sig) {
      calls.add('getTransaction');
      return overrides.getTransaction ? overrides.getTransaction(sig) : null;
    },
    async getAsset(mint) {
      calls.add('getAsset');
      return overrides.getAsset ? overrides.getAsset(mint) : null;
    },
    async getTokenSupply(mint) {
      calls.add('getTokenSupply');
      return overrides.getTokenSupply ? overrides.getTokenSupply(mint) : null;
    },
  };
  return { deps, calls };
}

describe('previewFacts — wallet', () => {
  test('routes to wallet facts: SOL balance + tx count', async () => {
    const { deps } = makeDeps({
      async getOwner() {
        return SYSTEM_PROGRAM;
      },
      async getBalance() {
        return 4.2;
      },
      async getTransactionCount() {
        return 137;
      },
    });
    const result = await previewFacts(WALLET_FIXTURE, deps);
    expect(result.kind).toBe('wallet');
    expect(result.facts).toEqual([
      { label: 'SOL balance', value: '4.2' },
      { label: 'Transactions', value: '137' },
    ]);
  });

  test('invokes only free lookups — never an Ace render', async () => {
    const { deps, calls } = makeDeps({
      async getOwner() {
        return SYSTEM_PROGRAM;
      },
    });
    await previewFacts(WALLET_FIXTURE, deps);
    // Free path: only detection + free balance/tx-count lookups ran.
    expect(calls.has('getOwner')).toBe(true);
    expect(calls.has('getBalance')).toBe(true);
    expect(calls.has('getTransactionCount')).toBe(true);
    // No token/tx/asset lookups for a wallet.
    expect(calls.has('getTokenSupply')).toBe(false);
    expect(calls.has('getTransaction')).toBe(false);
    // PreviewDeps has no Ace member at all — free path is guaranteed by construction.
    expect('ace' in deps).toBe(false);
    expect('chat' in deps).toBe(false);
  });
});

describe('previewFacts — tx', () => {
  test('routes to tx facts: status + slot', async () => {
    const { deps } = makeDeps({
      async getTransaction() {
        return { status: 'success', slot: 250_000_001 };
      },
    });
    const result = await previewFacts(TX_SIG, deps);
    expect(result.kind).toBe('tx');
    expect(result.facts).toEqual([
      { label: 'Status', value: 'success' },
      { label: 'Slot', value: '250000001' },
    ]);
  });

  test('tx not found renders an unknown status without throwing', async () => {
    const { deps } = makeDeps({
      async getTransaction() {
        return null;
      },
    });
    const result = await previewFacts(TX_SIG, deps);
    expect(result.kind).toBe('tx');
    expect(result.facts).toEqual([
      { label: 'Status', value: 'not found' },
      { label: 'Slot', value: '—' },
    ]);
  });

  test('detecting a tx never touches owner/balance/asset lookups', async () => {
    const { deps, calls } = makeDeps({
      async getTransaction() {
        return { status: 'success', slot: 1 };
      },
    });
    await previewFacts(TX_SIG, deps);
    expect(calls.has('getTransaction')).toBe(true);
    expect(calls.has('getOwner')).toBe(false);
    expect(calls.has('getBalance')).toBe(false);
    expect(calls.has('getAsset')).toBe(false);
  });
});

describe('previewFacts — nft', () => {
  test('routes to nft facts: DAS asset name', async () => {
    const { deps } = makeDeps({
      async getOwner() {
        return null;
      },
      async getAsset() {
        return { interface: 'V1_NFT', name: 'Stone Lantern #7' };
      },
    });
    const result = await previewFacts(NFT_MINT, deps);
    expect(result.kind).toBe('nft');
    expect(result.facts).toEqual([{ label: 'Asset', value: 'Stone Lantern #7' }]);
  });

  test('nft with no name falls back without throwing', async () => {
    const { deps } = makeDeps({
      async getOwner() {
        return null;
      },
      async getAsset() {
        return { interface: 'V1_NFT' };
      },
    });
    const result = await previewFacts(NFT_MINT, deps);
    expect(result.kind).toBe('nft');
    expect(result.facts).toEqual([{ label: 'Asset', value: 'Unnamed asset' }]);
  });
});

describe('previewFacts — token', () => {
  test('routes to token facts: supply + name', async () => {
    const { deps } = makeDeps({
      async getOwner() {
        return SPL_TOKEN_PROGRAM;
      },
      async getTokenSupply() {
        return { supply: 1_000_000, name: 'USD Coin' };
      },
    });
    const result = await previewFacts(TOKEN_MINT, deps);
    expect(result.kind).toBe('token');
    expect(result.facts).toEqual([
      { label: 'Supply', value: '1000000' },
      { label: 'Name', value: 'USD Coin' },
    ]);
  });

  test('token with no supply metadata falls back without throwing', async () => {
    const { deps } = makeDeps({
      async getOwner() {
        return SPL_TOKEN_PROGRAM;
      },
      async getTokenSupply() {
        return null;
      },
    });
    const result = await previewFacts(TOKEN_MINT, deps);
    expect(result.kind).toBe('token');
    expect(result.facts).toEqual([
      { label: 'Supply', value: '—' },
      { label: 'Name', value: 'Unnamed token' },
    ]);
  });

  test('token detection never invokes balance / tx-count / tx lookups', async () => {
    const { deps, calls } = makeDeps({
      async getOwner() {
        return SPL_TOKEN_PROGRAM;
      },
      async getTokenSupply() {
        return { supply: 1, name: 'X' };
      },
    });
    await previewFacts(TOKEN_MINT, deps);
    expect(calls.has('getTokenSupply')).toBe(true);
    expect(calls.has('getBalance')).toBe(false);
    expect(calls.has('getTransactionCount')).toBe(false);
    expect(calls.has('getTransaction')).toBe(false);
  });
});
