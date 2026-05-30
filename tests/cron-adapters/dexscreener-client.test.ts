import { afterEach, describe, expect, test } from 'bun:test';
import { createDexscreenerClient } from '@/cron-adapters';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(impl: (url: string) => Response): string[] {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    return impl(url);
  }) as typeof fetch;
  return calls;
}

describe('createDexscreenerClient', () => {
  test('hits the keyless search endpoint with the URL-encoded ticker', async () => {
    const calls = stubFetch(() => Response.json({ pairs: [] }));
    const dex = createDexscreenerClient();
    await dex.search('BO NK');
    expect(calls[0]).toBe('https://api.dexscreener.com/latest/dex/search?q=BO%20NK');
  });

  test('returns the pairs array from the JSON body', async () => {
    stubFetch(() =>
      Response.json({
        pairs: [
          {
            chainId: 'solana',
            dexId: 'raydium',
            pairAddress: 'p1',
            baseToken: { address: 'MINT1', name: 'Bonk', symbol: 'BONK' },
            liquidity: { usd: 50_000 },
            volume: { h24: 20_000 },
          },
        ],
      }),
    );
    const dex = createDexscreenerClient();
    const pairs = await dex.search('BONK');
    expect(pairs).toHaveLength(1);
    expect(pairs[0].baseToken.address).toBe('MINT1');
  });

  test('tolerates a missing pairs field → empty array', async () => {
    stubFetch(() => Response.json({}));
    const dex = createDexscreenerClient();
    expect(await dex.search('BONK')).toEqual([]);
  });

  test('returns empty array on a non-OK response (e.g. 429)', async () => {
    stubFetch(() => new Response('rate limited', { status: 429 }));
    const dex = createDexscreenerClient();
    expect(await dex.search('BONK')).toEqual([]);
  });
});

describe('createDexscreenerClient — pairsForMint', () => {
  test('hits the keyless tokens endpoint with the URL-encoded mint', async () => {
    const calls = stubFetch(() => Response.json({ pairs: [] }));
    const dex = createDexscreenerClient();
    await dex.pairsForMint('9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump');
    expect(calls[0]).toBe(
      'https://api.dexscreener.com/latest/dex/tokens/9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump',
    );
  });

  test('returns every pool the mint trades in (aggregate source)', async () => {
    stubFetch(() =>
      Response.json({
        pairs: [
          {
            chainId: 'solana',
            dexId: 'raydium',
            pairAddress: 'p1',
            baseToken: { address: 'MINT1', name: 'Fartcoin', symbol: 'Fartcoin' },
            liquidity: { usd: 4_000_000 },
            volume: { h24: 3_000_000 },
            marketCap: 149_000_000,
          },
          {
            chainId: 'solana',
            dexId: 'meteora',
            pairAddress: 'p2',
            baseToken: { address: 'MINT1', name: 'Fartcoin', symbol: 'Fartcoin' },
            liquidity: { usd: 4_000_000 },
            volume: { h24: 3_000_000 },
            marketCap: 149_000_000,
          },
        ],
      }),
    );
    const dex = createDexscreenerClient();
    const pairs = await dex.pairsForMint('MINT1');
    expect(pairs).toHaveLength(2);
  });

  test('tolerates a missing/null pairs field → empty array', async () => {
    stubFetch(() => Response.json({ pairs: null }));
    const dex = createDexscreenerClient();
    expect(await dex.pairsForMint('MINT1')).toEqual([]);
  });

  test('returns empty array on a non-OK response (e.g. 429)', async () => {
    stubFetch(() => new Response('rate limited', { status: 429 }));
    const dex = createDexscreenerClient();
    expect(await dex.pairsForMint('MINT1')).toEqual([]);
  });
});
