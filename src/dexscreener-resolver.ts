// Resolves a token ticker to a real on-chain Solana mint via the keyless
// Dexscreener API. The resolution is deterministic — the LLM only supplies a
// candidate ticker; this module never accepts an invented address.
//
// Two-step lookup, because the two Dexscreener endpoints disagree:
//   1. /latest/dex/search?q={ticker} is FUZZY DISCOVERY. It surfaces only ONE
//      (often non-canonical) pair per token, so its per-row liquidity/volume is
//      unreliable — for a hyped token it can return a near-dead backwater pool.
//   2. /latest/dex/tokens/{mint} returns ALL of a mint's pools, the only place to
//      read its TRUE aggregated liquidity / 24h volume.
// So search is used purely to enumerate candidate mints; each candidate is then
// judged on its aggregated profile (step 2). This is why a SERP-trending coin
// that surfaced a $213 pool in search is still recognised as the $149M token.

// ── External boundary (mirrors GET /latest/dex/{search,tokens} response shape) ─

export interface DexPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  priceChange?: { h24?: number };
  // Token-level valuation (price × supply). Present on every pair for a mint and
  // independent of which pool surfaced it — the reliable "size" signal even when
  // search returns a dead pool for an otherwise huge token. `fdv` is the fallback.
  marketCap?: number;
  fdv?: number;
}

export interface DexscreenerClient {
  /** GET /latest/dex/search?q={ticker} — fuzzy discovery of candidate pairs. */
  search(ticker: string): Promise<DexPair[]>;
  /** GET /latest/dex/tokens/{mint} — ALL pools for one mint (true aggregate). */
  pairsForMint(mint: string): Promise<DexPair[]>;
}

export interface ResolvedToken {
  mint: string;
  symbol: string;
  /** Aggregated across all of the mint's solana pools. */
  liquidityUsd: number;
  /** Aggregated across all of the mint's solana pools. */
  volumeH24: number;
  /** Token-level market cap (marketCap, falling back to fdv). */
  marketCapUsd: number;
  // true when >1 DISTINCT mint cleared the floors — the pick is the
  // highest-liquidity one, but the operator should know it was contested.
  ambiguous: boolean;
}

export interface ResolveDeps {
  dex: DexscreenerClient;
  minLiquidityUsd?: number; // default 10_000
  minVolumeH24?: number; // default 5_000
  minMarketCapUsd?: number; // default 1_000_000
  log?: (msg: string) => void;
}

interface MintProfile {
  mint: string;
  symbol: string;
  liquidityUsd: number;
  volumeH24: number;
  marketCapUsd: number;
}

/** Aggregate a mint's true market profile across all its solana pools. */
function aggregateProfile(mint: string, symbol: string, pairs: DexPair[]): MintProfile {
  const sol = pairs.filter((p) => p.chainId === 'solana');
  const liquidityUsd = sol.reduce((s, p) => s + (p.liquidity?.usd ?? 0), 0);
  const volumeH24 = sol.reduce((s, p) => s + (p.volume?.h24 ?? 0), 0);
  // Market cap is token-level; take the max reported across pools (fdv fallback).
  const marketCapUsd = sol.reduce((m, p) => Math.max(m, p.marketCap ?? p.fdv ?? 0), 0);
  return { mint, symbol, liquidityUsd, volumeH24, marketCapUsd };
}

export async function resolveTokenMint(
  ticker: string,
  serpText: string,
  deps: ResolveDeps,
): Promise<ResolvedToken | null> {
  // Gate 1: the ticker must be SERP-grounded. The LLM picks FROM the SERP text;
  // it does not author tickers. Reject anything not literally present.
  if (!serpText.toLowerCase().includes(ticker.toLowerCase())) {
    return null;
  }

  const minLiquidityUsd = deps.minLiquidityUsd ?? 10_000;
  const minVolumeH24 = deps.minVolumeH24 ?? 5_000;
  const minMarketCapUsd = deps.minMarketCapUsd ?? 1_000_000;

  // Gate 2: solana chain + exact (case-insensitive) symbol match. Used only to
  // ENUMERATE distinct candidate mints — never to size them (search rows lie).
  const pairs = await deps.dex.search(ticker);
  const mintSymbols = new Map<string, string>();
  for (const p of pairs) {
    if (p.chainId !== 'solana') continue;
    if (p.baseToken.symbol.toLowerCase() !== ticker.toLowerCase()) continue;
    if (!mintSymbols.has(p.baseToken.address)) {
      mintSymbols.set(p.baseToken.address, p.baseToken.symbol);
    }
  }
  if (mintSymbols.size === 0) return null;

  // Re-fetch each candidate's TRUE aggregated profile across all its pools. The
  // search row may be a near-dead pool: real Fartcoin (9BB6NF…) surfaced a $213
  // pool while its 30 pools hold ~$8M liquidity / ~$6M 24h volume. Judging on the
  // search row alone admits a $56k copycat and rejects the real $149M token.
  const profiles = await Promise.all(
    [...mintSymbols].map(async ([mint, symbol]) =>
      aggregateProfile(mint, symbol, await deps.dex.pairsForMint(mint)),
    ),
  );

  // Gate 3: size floors on the AGGREGATED profile. A token prominent enough to
  // surface in the trending SERP cannot be low-cap, illiquid, or untraded
  // (operator rule). The market-cap floor ejects micro-cap copycats; the volume
  // floor ejects spoofed-liquidity pools showing billions in TVL but ~$0 trading.
  const survivors = profiles.filter(
    (p) =>
      p.liquidityUsd >= minLiquidityUsd &&
      p.volumeH24 >= minVolumeH24 &&
      p.marketCapUsd >= minMarketCapUsd,
  );

  if (survivors.length === 0) return null;

  // Gate 4: collision guard. If distinct mints clear the floors, pick the
  // highest-liquidity mint (TVL is harder to fake than volume) and flag it.
  const ambiguous = survivors.length > 1;
  if (ambiguous) {
    deps.log?.(
      `dexscreener: ambiguous ticker "${ticker}" — ${survivors.length} distinct mints cleared the floor; picking highest liquidity`,
    );
  }

  // Rank: highest aggregated liquidity first (resolves collisions to the real
  // mint), tie-break on 24h volume.
  const [winner] = [...survivors].sort(
    (a, b) => b.liquidityUsd - a.liquidityUsd || b.volumeH24 - a.volumeH24,
  );

  return {
    mint: winner.mint,
    symbol: winner.symbol,
    liquidityUsd: winner.liquidityUsd,
    volumeH24: winner.volumeH24,
    marketCapUsd: winner.marketCapUsd,
    ambiguous,
  };
}
