import { afterEach, describe, expect, test } from 'bun:test';
import { buildTokenSpotlightSource } from '@/lib/token-spotlight-source';

const RPC_URL = 'https://rpc.test/';
const BONK_MINT = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

type RpcHandler = (method: string, params: unknown) => unknown;

/**
 * Route fetch by destination: Dexscreener token URLs go to `dex`, RPC POSTs are
 * dispatched to `rpc` by their JSON-RPC `method`. Records every URL hit.
 */
function stubFetch(opts: {
  dex?: (url: string) => Response;
  rpc?: RpcHandler;
}): { calls: string[]; methods: string[] } {
  const calls: string[] = [];
  const methods: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith('https://api.dexscreener.com/')) {
      return opts.dex?.(url) ?? Response.json({ pairs: [] });
    }
    const body = JSON.parse(String(init?.body ?? '{}')) as { method: string; params: unknown };
    methods.push(body.method);
    const result = opts.rpc?.(body.method, body.params);
    return Response.json({ result });
  }) as typeof fetch;
  return { calls, methods };
}

const DEX_PAIR = {
  chainId: 'solana',
  baseToken: { name: 'Bonk', symbol: 'BONK' },
  priceUsd: '0.00003',
  liquidity: { usd: 250_000 },
  volume: { h24: 1_200_000 },
  priceChange: { h24: -3.5 },
};

describe('buildTokenSpotlightSource — getAssetInfo', () => {
  test('Dexscreener hit: highest-liquidity solana pair → full market layer', async () => {
    stubFetch({
      dex: () =>
        Response.json({
          pairs: [
            { ...DEX_PAIR, liquidity: { usd: 10_000 }, priceUsd: '0.00009' },
            DEX_PAIR, // higher liquidity wins
          ],
        }),
    });
    const src = buildTokenSpotlightSource(RPC_URL);
    const info = await src.getAssetInfo(BONK_MINT);
    expect(info.ticker).toBe('BONK');
    expect(info.name).toBe('Bonk');
    expect(info.spotPriceUsd).toBe(0.00003);
    expect(info.liquidityUsd).toBe(250_000);
    expect(info.volume24h).toBe(1_200_000);
    expect(info.priceChange24h).toBe(-3.5);
  });

  test('hits the keyless Dexscreener tokens endpoint with the mint', async () => {
    const { calls } = stubFetch({ dex: () => Response.json({ pairs: [DEX_PAIR] }) });
    await buildTokenSpotlightSource(RPC_URL).getAssetInfo(BONK_MINT);
    expect(calls[0]).toBe(`https://api.dexscreener.com/latest/dex/tokens/${BONK_MINT}`);
  });

  test('ignores non-solana pairs when ranking', async () => {
    stubFetch({
      dex: () =>
        Response.json({
          pairs: [
            { ...DEX_PAIR, chainId: 'ethereum', liquidity: { usd: 9_999_999 } },
            DEX_PAIR,
          ],
        }),
    });
    const info = await buildTokenSpotlightSource(RPC_URL).getAssetInfo(BONK_MINT);
    expect(info.liquidityUsd).toBe(250_000);
  });

  test('Dexscreener empty → DAS getAsset fallback (market fields null)', async () => {
    stubFetch({
      dex: () => Response.json({ pairs: [] }),
      rpc: (method) =>
        method === 'getAsset'
          ? {
              content: { metadata: { name: 'Bonk', symbol: 'BONK' } },
              token_info: { symbol: 'BONK', price_info: { price_per_token: 0.00005 } },
            }
          : null,
    });
    const info = await buildTokenSpotlightSource(RPC_URL).getAssetInfo(BONK_MINT);
    expect(info.ticker).toBe('BONK');
    expect(info.name).toBe('Bonk');
    expect(info.spotPriceUsd).toBe(0.00005);
    expect(info.liquidityUsd).toBeNull();
    expect(info.volume24h).toBeNull();
    expect(info.priceChange24h).toBeNull();
  });

  test('Dexscreener non-solana-only → DAS fallback', async () => {
    stubFetch({
      dex: () => Response.json({ pairs: [{ ...DEX_PAIR, chainId: 'ethereum' }] }),
      rpc: (method) =>
        method === 'getAsset'
          ? { content: { metadata: { name: 'EthTok', symbol: 'ETK' } } }
          : null,
    });
    const info = await buildTokenSpotlightSource(RPC_URL).getAssetInfo(BONK_MINT);
    expect(info.ticker).toBe('ETK');
    expect(info.spotPriceUsd).toBeNull();
  });

  test('both empty → all nulls (never throws)', async () => {
    stubFetch({ dex: () => Response.json({ pairs: [] }), rpc: () => ({}) });
    const info = await buildTokenSpotlightSource(RPC_URL).getAssetInfo(BONK_MINT);
    expect(info).toEqual({
      ticker: null,
      name: null,
      spotPriceUsd: null,
      liquidityUsd: null,
      volume24h: null,
      priceChange24h: null,
      imageUri: null,
    });
  });

  test('Dexscreener HTTP error → DAS fallback', async () => {
    stubFetch({
      dex: () => new Response('rate limited', { status: 429 }),
      rpc: (method) =>
        method === 'getAsset' ? { token_info: { symbol: 'BONK' } } : null,
    });
    const info = await buildTokenSpotlightSource(RPC_URL).getAssetInfo(BONK_MINT);
    expect(info.ticker).toBe('BONK');
  });
});

describe('buildTokenSpotlightSource — getMintInfo', () => {
  const mintAccount = (over: Record<string, unknown>) => ({
    value: { data: { parsed: { info: { decimals: 5, supply: '92700000000000000', ...over } } } },
  });

  test('parses decimals, supply, and renounced flags (both null authorities)', async () => {
    stubFetch({
      rpc: (method) =>
        method === 'getAccountInfo'
          ? mintAccount({ mintAuthority: null, freezeAuthority: null })
          : null,
    });
    const info = await buildTokenSpotlightSource(RPC_URL).getMintInfo(BONK_MINT);
    expect(info.decimals).toBe(5);
    expect(info.supplyRaw).toBe(BigInt('92700000000000000'));
    expect(info.mintRenounced).toBe(true);
    expect(info.freezeRenounced).toBe(true);
  });

  test('active authorities → renounced flags false', async () => {
    stubFetch({
      rpc: (method) =>
        method === 'getAccountInfo'
          ? mintAccount({ mintAuthority: 'SomeAuthority1111', freezeAuthority: 'SomeFreeze1111' })
          : null,
    });
    const info = await buildTokenSpotlightSource(RPC_URL).getMintInfo(BONK_MINT);
    expect(info.mintRenounced).toBe(false);
    expect(info.freezeRenounced).toBe(false);
  });

  test('missing account → empty mint info (never throws)', async () => {
    stubFetch({ rpc: () => null });
    const info = await buildTokenSpotlightSource(RPC_URL).getMintInfo(BONK_MINT);
    expect(info).toEqual({
      decimals: 0,
      supplyRaw: BigInt(0),
      mintRenounced: false,
      freezeRenounced: false,
    });
  });

  test('HTTP error → empty mint info', async () => {
    globalThis.fetch = (async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
    const info = await buildTokenSpotlightSource(RPC_URL).getMintInfo(BONK_MINT);
    expect(info.decimals).toBe(0);
    expect(info.mintRenounced).toBe(false);
  });
});

describe('buildTokenSpotlightSource — getLaunchedAt', () => {
  test('oldest-of-page blockTime when the page is not capped', async () => {
    stubFetch({
      rpc: (method) =>
        method === 'getSignaturesForAddress'
          ? [{ blockTime: 1700000000 }, { blockTime: 1671926400 }]
          : null,
    });
    const launched = await buildTokenSpotlightSource(RPC_URL).getLaunchedAt(BONK_MINT);
    expect(launched).toBe(1671926400);
  });

  test('full 1000-item page → null (older sigs exist beyond the page)', async () => {
    stubFetch({
      rpc: (method) =>
        method === 'getSignaturesForAddress'
          ? Array.from({ length: 1000 }, (_, i) => ({ blockTime: 1700000000 + i }))
          : null,
    });
    const launched = await buildTokenSpotlightSource(RPC_URL).getLaunchedAt(BONK_MINT);
    expect(launched).toBeNull();
  });

  test('empty list → null', async () => {
    stubFetch({ rpc: () => [] });
    expect(await buildTokenSpotlightSource(RPC_URL).getLaunchedAt(BONK_MINT)).toBeNull();
  });

  test('HTTP error → null (never throws)', async () => {
    globalThis.fetch = (async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
    expect(await buildTokenSpotlightSource(RPC_URL).getLaunchedAt(BONK_MINT)).toBeNull();
  });
});
