/**
 * Shared `TokenSpotlightSource` (ADR 0014) — one source for both the reactive
 * mint route and the autonomous cron tick.
 *
 * - getMintInfo: RPC `getAccountInfo` (jsonParsed) → decimals, raw supply, and
 *   renounced flags (authority === null). Ported from the inline `buildTokenSource`
 *   in `src/app/api/mint/story/route.ts`.
 * - getAssetInfo: keyless Dexscreener `/latest/dex/tokens/{mint}` PRIMARY (price +
 *   market layer), falling back to DAS `getAsset` (ticker/name/spot price only,
 *   market fields null) when Dexscreener is empty for the mint.
 * - getLaunchedAt: oldest signature unix time via RPC `getSignaturesForAddress`.
 *
 * Every method is keyless and fail-soft: any transport/HTTP/parse error yields a
 * safe empty value (never throws), so a flaky RPC or rate-limited Dexscreener
 * degrades to nulls rather than crashing the render.
 */

import type { TokenAssetInfo, TokenMintInfo, TokenSpotlightSource } from '@/spotlight-fetcher';

const EMPTY_MINT_INFO: TokenMintInfo = {
  decimals: 0,
  supplyRaw: BigInt(0),
  mintRenounced: false,
  freezeRenounced: false,
};

const EMPTY_ASSET_INFO: TokenAssetInfo = {
  ticker: null,
  name: null,
  spotPriceUsd: null,
  liquidityUsd: null,
  volume24h: null,
  priceChange24h: null,
  imageUri: null,
};

// ── Dexscreener /latest/dex/tokens/{mint} response (subset we read) ───────────
interface DexTokenPair {
  chainId?: string;
  baseToken?: { name?: unknown; symbol?: unknown };
  priceUsd?: unknown;
  liquidity?: { usd?: unknown };
  volume?: { h24?: unknown };
  priceChange?: { h24?: unknown };
  info?: { imageUrl?: unknown };
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function httpUrl(v: unknown): string | null {
  const s = str(v);
  return s && /^https?:\/\//.test(s) ? s : null;
}

async function rpc(rpcUrl: string, method: string, params: unknown): Promise<unknown> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`rpc ${method} ${res.status}`);
  const json = (await res.json()) as { result?: unknown };
  return json.result;
}

/** Dexscreener-primary market data for a mint. null when no solana pair found. */
async function fetchDexAsset(mint: string): Promise<TokenAssetInfo | null> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { pairs?: DexTokenPair[] | null };
    const pairs = (json.pairs ?? []).filter((p) => p.chainId === 'solana');
    if (pairs.length === 0) return null;
    // Highest-liquidity solana pair is the canonical one (mirrors the resolver).
    const best = [...pairs].sort(
      (a, b) => (num(b.liquidity?.usd) ?? 0) - (num(a.liquidity?.usd) ?? 0),
    )[0];
    return {
      ticker: str(best.baseToken?.symbol),
      name: str(best.baseToken?.name),
      spotPriceUsd: num(best.priceUsd),
      liquidityUsd: num(best.liquidity?.usd),
      volume24h: num(best.volume?.h24),
      priceChange24h: num(best.priceChange?.h24),
      imageUri: httpUrl(best.info?.imageUrl),
    };
  } catch {
    return null;
  }
}

/** DAS getAsset fallback — ticker/name/spot price only; market fields null. */
async function fetchDasAsset(rpcUrl: string, mint: string): Promise<TokenAssetInfo> {
  try {
    const r = ((await rpc(rpcUrl, 'getAsset', { id: mint })) ?? {}) as Record<string, unknown>;
    const content = r.content as
      | { metadata?: { name?: unknown; symbol?: unknown }; links?: { image?: unknown } }
      | undefined;
    const tokenInfo = r.token_info as
      | { symbol?: unknown; price_info?: { price_per_token?: unknown } }
      | undefined;
    const symbol = str(tokenInfo?.symbol) ?? str(content?.metadata?.symbol);
    const name = str(content?.metadata?.name);
    return {
      ticker: symbol,
      name,
      spotPriceUsd: num(tokenInfo?.price_info?.price_per_token),
      liquidityUsd: null,
      volume24h: null,
      priceChange24h: null,
      imageUri: httpUrl(content?.links?.image),
    };
  } catch {
    return { ...EMPTY_ASSET_INFO };
  }
}

export function buildTokenSpotlightSource(rpcUrl: string): TokenSpotlightSource {
  return {
    async getMintInfo(mint) {
      try {
        const value = (await rpc(rpcUrl, 'getAccountInfo', [
          mint,
          { encoding: 'jsonParsed', commitment: 'confirmed' },
        ])) as { value?: { data?: { parsed?: { info?: unknown } } } } | null;
        const info = value?.value?.data?.parsed?.info as
          | {
              decimals?: number;
              supply?: string;
              mintAuthority?: string | null;
              freezeAuthority?: string | null;
            }
          | undefined;
        if (!info) return { ...EMPTY_MINT_INFO };
        return {
          decimals: info.decimals ?? 0,
          supplyRaw: BigInt(info.supply ?? '0'),
          mintRenounced: (info.mintAuthority ?? null) === null,
          freezeRenounced: (info.freezeAuthority ?? null) === null,
        };
      } catch {
        return { ...EMPTY_MINT_INFO };
      }
    },
    async getAssetInfo(mint) {
      const dex = await fetchDexAsset(mint);
      if (dex !== null) return dex;
      // Dexscreener empty/error → DAS getAsset fallback (market fields null).
      return fetchDasAsset(rpcUrl, mint);
    },
    async getLaunchedAt(mint) {
      try {
        const items = (await rpc(rpcUrl, 'getSignaturesForAddress', [
          mint,
          { limit: 1000 },
        ])) as Array<{ blockTime?: number | null }> | null;
        if (!Array.isArray(items) || items.length === 0) return null;
        // Signatures come newest-first and this call is unpaginated. A full page
        // (== the requested limit) means older signatures exist beyond it, so the
        // oldest-of-page is NOT the launch. Return null rather than feed the LLM a
        // wrong (too-recent) date; only trust the oldest when the page isn't capped.
        if (items.length >= 1000) return null;
        const oldest = items[items.length - 1];
        return typeof oldest.blockTime === 'number' ? oldest.blockTime : null;
      } catch {
        return null;
      }
    },
  };
}
