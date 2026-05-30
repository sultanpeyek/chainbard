import { describe, expect, test } from 'bun:test';
import { fetchTokenSpotlights, type TokenSpotlightSource } from '@/spotlight-fetcher';

const BONK_MINT = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';

type CallLog = { method: string };

function makeSource(opts?: {
  ticker?: string | null;
  name?: string | null;
  spotPriceUsd?: number | null;
  liquidityUsd?: number | null;
  volume24h?: number | null;
  priceChange24h?: number | null;
  launchedAt?: number | null;
  mintRenounced?: boolean;
  freezeRenounced?: boolean;
  log?: CallLog[];
}): TokenSpotlightSource {
  const log = opts?.log ?? [];
  return {
    async getMintInfo(_mint) {
      log.push({ method: 'getMintInfo' });
      return {
        decimals: 5,
        supplyRaw: BigInt('92700000000000000'),
        mintRenounced: opts?.mintRenounced ?? true,
        freezeRenounced: opts?.freezeRenounced ?? true,
      };
    },
    async getAssetInfo(_mint) {
      log.push({ method: 'getAssetInfo' });
      return {
        ticker: opts !== undefined && 'ticker' in opts ? (opts.ticker ?? null) : 'BONK',
        name: opts !== undefined && 'name' in opts ? (opts.name ?? null) : 'Bonk',
        spotPriceUsd:
          opts !== undefined && 'spotPriceUsd' in opts ? (opts.spotPriceUsd ?? null) : 0.00003,
        ...(opts !== undefined && 'liquidityUsd' in opts
          ? { liquidityUsd: opts.liquidityUsd ?? null }
          : {}),
        ...(opts !== undefined && 'volume24h' in opts ? { volume24h: opts.volume24h ?? null } : {}),
        ...(opts !== undefined && 'priceChange24h' in opts
          ? { priceChange24h: opts.priceChange24h ?? null }
          : {}),
      };
    },
    async getLaunchedAt(_mint) {
      log.push({ method: 'getLaunchedAt' });
      return opts !== undefined && 'launchedAt' in opts ? (opts.launchedAt ?? null) : 1671926400;
    },
  };
}

describe('fetchTokenSpotlights — token branch', () => {
  test('returns mint address, ticker, and name from source', async () => {
    const source = makeSource({ ticker: 'BONK', name: 'Bonk' });
    const result = await fetchTokenSpotlights(BONK_MINT, source);
    expect(result.mint).toBe(BONK_MINT);
    expect(result.ticker).toBe('BONK');
    expect(result.name).toBe('Bonk');
  });

  test('passes through a non-null launchedAt', async () => {
    const source = makeSource({ launchedAt: 1671926400 });
    const result = await fetchTokenSpotlights(BONK_MINT, source);
    expect(result.launchedAt).toBe(1671926400);
  });

  test('handles null launchedAt gracefully', async () => {
    const source = makeSource({ launchedAt: null });
    const result = await fetchTokenSpotlights(BONK_MINT, source);
    expect(result.launchedAt).toBeNull();
  });

  test('null spotPriceUsd yields null spotPriceUsd and null mcapDisplay', async () => {
    const source = makeSource({ spotPriceUsd: null });
    const result = await fetchTokenSpotlights(BONK_MINT, source);
    expect(result.spotPriceUsd).toBeNull();
    expect(result.mcapDisplay).toBeNull();
  });

  test('computes mcapDisplay from spot price, supply, and decimals', async () => {
    // spotPriceUsd 0.00003 × (92_700_000_000_000_000 / 10^5 = 927_000_000_000) ≈ $27.81M
    const source = makeSource({ spotPriceUsd: 0.00003 });
    const result = await fetchTokenSpotlights(BONK_MINT, source);
    expect(result.spotPriceUsd).toBe(0.00003);
    expect(result.mcapDisplay).toBe('$27.81M');
  });

  test('formats the UI supply string with locale grouping', async () => {
    const source = makeSource();
    const result = await fetchTokenSpotlights(BONK_MINT, source);
    expect(result.decimals).toBe(5);
    expect(result.supplyRaw).toBe(BigInt('92700000000000000'));
    expect(result.supplyUiString).toMatch(/927,000,000,000/);
  });

  test('passes through renounced flags verbatim', async () => {
    const source = makeSource({ mintRenounced: true, freezeRenounced: false });
    const result = await fetchTokenSpotlights(BONK_MINT, source);
    expect(result.mintRenounced).toBe(true);
    expect(result.freezeRenounced).toBe(false);
  });

  test('passes through Dexscreener market fields when the source supplies them', async () => {
    const source = makeSource({ liquidityUsd: 250_000, volume24h: 1_200_000, priceChange24h: -3.5 });
    const result = await fetchTokenSpotlights(BONK_MINT, source);
    expect(result.liquidityUsd).toBe(250_000);
    expect(result.volume24h).toBe(1_200_000);
    expect(result.priceChange24h).toBe(-3.5);
  });

  test('defaults market fields to null when the source omits them', async () => {
    const source = makeSource();
    const result = await fetchTokenSpotlights(BONK_MINT, source);
    expect(result.liquidityUsd).toBeNull();
    expect(result.volume24h).toBeNull();
    expect(result.priceChange24h).toBeNull();
  });

  test('passes through explicit null market fields', async () => {
    const source = makeSource({ liquidityUsd: null, volume24h: null, priceChange24h: null });
    const result = await fetchTokenSpotlights(BONK_MINT, source);
    expect(result.liquidityUsd).toBeNull();
    expect(result.volume24h).toBeNull();
    expect(result.priceChange24h).toBeNull();
  });

  test('handles null ticker and name gracefully', async () => {
    const source = makeSource({ ticker: null, name: null });
    const result = await fetchTokenSpotlights(BONK_MINT, source);
    expect(result.ticker).toBeNull();
    expect(result.name).toBeNull();
  });

  test('tracks the three source calls used', async () => {
    const log: CallLog[] = [];
    const source = makeSource({ log });
    const result = await fetchTokenSpotlights(BONK_MINT, source);
    expect(result.sourceCallsUsed).toBe(3);
    expect(log).toHaveLength(3);
  });

  test('issues all source calls in parallel (single round trip)', async () => {
    const callOrder: string[] = [];
    const source: TokenSpotlightSource = {
      async getMintInfo(_m) {
        callOrder.push('getMintInfo');
        return { decimals: 6, supplyRaw: BigInt(1000), mintRenounced: false, freezeRenounced: false };
      },
      async getAssetInfo(_m) {
        callOrder.push('getAssetInfo');
        return { ticker: 'T', name: 'Test', spotPriceUsd: null };
      },
      async getLaunchedAt(_m) {
        callOrder.push('getLaunchedAt');
        return null;
      },
    };
    await fetchTokenSpotlights(BONK_MINT, source);
    expect(callOrder).toHaveLength(3);
  });
});
