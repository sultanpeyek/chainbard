import { describe, expect, test } from 'bun:test';
import {
  resolveTokenMint,
  type DexscreenerClient,
  type DexPair,
} from '@/dexscreener-resolver';

// ── Real on-chain mints (valid base58) used as fixtures ───────────────────────
const BONK_MINT = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
const FAKE_BONK_MINT = 'So11111111111111111111111111111111111111112';

// ── Pair fixture builder (mirrors real Dexscreener /latest/dex/search shape) ──
function pair(over: Partial<DexPair> & { baseToken: DexPair['baseToken'] }): DexPair {
  return {
    chainId: 'solana',
    dexId: 'orca',
    pairAddress: 'pair-' + over.baseToken.address,
    liquidity: { usd: 100_000 },
    volume: { h24: 50_000 },
    priceChange: { h24: 1.5 },
    // Default well above the market-cap floor so size-floor-agnostic tests pass.
    marketCap: 50_000_000,
    ...over,
  };
}

// Default mock: `pairsForMint` derives a mint's pools from the same fixture list
// that `search` returns (search ⊇ that mint's pools). For scenarios where the
// search row diverges from a mint's true pools (the Fartcoin bug), use
// `makeDexSplit` below.
function makeDex(pairs: DexPair[]): DexscreenerClient {
  return {
    async search() {
      return pairs;
    },
    async pairsForMint(mint) {
      return pairs.filter((p) => p.baseToken.address === mint);
    },
  };
}

// Models the real Dexscreener divergence: `/latest/dex/search` surfaces ONE
// (often non-canonical) pair per mint, while `/latest/dex/tokens/{mint}` returns
// that mint's full pool set. `poolsByMint` overrides what each candidate's true
// aggregated profile looks like, independent of the search row.
function makeDexSplit(searchPairs: DexPair[], poolsByMint: Record<string, DexPair[]>): DexscreenerClient {
  return {
    async search() {
      return searchPairs;
    },
    async pairsForMint(mint) {
      return poolsByMint[mint] ?? [];
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('resolveTokenMint — tracer bullet', () => {
  test('SERP-grounded ticker with one matching solana pair resolves to the real mint', async () => {
    const serpText = 'BONK rallies as Solana memecoins surge today';
    const dex = makeDex([
      pair({ baseToken: { address: BONK_MINT, name: 'Bonk', symbol: 'BONK' } }),
    ]);

    const resolved = await resolveTokenMint('BONK', serpText, { dex });

    expect(resolved).not.toBeNull();
    expect(resolved!.mint).toBe(BONK_MINT);
    expect(resolved!.symbol).toBe('BONK');
    // rationale must cite a REAL field, not LLM vibes
    expect(resolved!.liquidityUsd).toBe(100_000);
    expect(resolved!.volumeH24).toBe(50_000);
  });
});

describe('resolveTokenMint — SERP-grounding gate (anti-hallucination)', () => {
  test('ticker absent from SERP text is rejected even if Dexscreener returns a pair', async () => {
    // The LLM invented a ticker that never appeared in the SERP snippets.
    // Dexscreener WOULD resolve it, but we must not accept an ungrounded pick.
    const serpText = 'Solana price dips 5% amid broad market decline';
    const dex = makeDex([
      pair({ baseToken: { address: FAKE_BONK_MINT, name: 'Bonk', symbol: 'BONK' } }),
    ]);

    const resolved = await resolveTokenMint('BONK', serpText, { dex });

    expect(resolved).toBeNull();
  });

  test('ticker match is case-insensitive against SERP text', async () => {
    const serpText = 'why bonk is the talk of solana today';
    const dex = makeDex([
      pair({ baseToken: { address: BONK_MINT, name: 'Bonk', symbol: 'BONK' } }),
    ]);

    const resolved = await resolveTokenMint('BONK', serpText, { dex });

    expect(resolved!.mint).toBe(BONK_MINT);
  });
});

describe('resolveTokenMint — deterministic filters', () => {
  test('ignores pairs on non-solana chains', async () => {
    const serpText = 'BONK trends across chains';
    const dex = makeDex([
      pair({ chainId: 'ethereum', baseToken: { address: '0xdeadbeef', name: 'Bonk', symbol: 'BONK' } }),
    ]);

    const resolved = await resolveTokenMint('BONK', serpText, { dex });

    expect(resolved).toBeNull();
  });

  test('ignores pairs whose symbol does not exactly match the ticker', async () => {
    // Fuzzy Dexscreener search can return adjacent tokens (e.g. "BONKINU").
    const serpText = 'BONK is trending on Solana';
    const dex = makeDex([
      pair({ baseToken: { address: FAKE_BONK_MINT, name: 'Bonk Inu', symbol: 'BONKINU' } }),
    ]);

    const resolved = await resolveTokenMint('BONK', serpText, { dex });

    expect(resolved).toBeNull();
  });

  test('drops pairs below the liquidity/volume floor (dead/scam symbol hijack)', async () => {
    const serpText = 'BONK is trending on Solana';
    const dex = makeDex([
      pair({
        baseToken: { address: FAKE_BONK_MINT, name: 'Bonk', symbol: 'BONK' },
        liquidity: { usd: 500 },
        volume: { h24: 100 },
      }),
    ]);

    const resolved = await resolveTokenMint('BONK', serpText, { dex });

    expect(resolved).toBeNull();
  });

  test('accepts custom floor thresholds', async () => {
    const serpText = 'BONK is trending on Solana';
    const dex = makeDex([
      pair({
        baseToken: { address: BONK_MINT, name: 'Bonk', symbol: 'BONK' },
        liquidity: { usd: 20_000 },
        volume: { h24: 8_000 },
      }),
    ]);

    // Default floor would accept; a higher custom floor rejects.
    const resolved = await resolveTokenMint('BONK', serpText, {
      dex,
      minLiquidityUsd: 50_000,
    });

    expect(resolved).toBeNull();
  });
});

describe('resolveTokenMint — ranking & collisions', () => {
  test('aggregates liquidity and 24h volume across all of the mint pools', async () => {
    // A mint trades across many pools; its true size is the SUM, not any single
    // pool. The resolver must read the aggregated profile, not one search row.
    const serpText = 'BONK is trending on Solana';
    const dex = makeDex([
      pair({
        baseToken: { address: BONK_MINT, name: 'Bonk', symbol: 'BONK' },
        pairAddress: 'pool-a',
        liquidity: { usd: 100_000 },
        volume: { h24: 10_000 },
      }),
      pair({
        baseToken: { address: BONK_MINT, name: 'Bonk', symbol: 'BONK' },
        pairAddress: 'pool-b',
        liquidity: { usd: 100_000 },
        volume: { h24: 90_000 },
      }),
    ]);

    const resolved = await resolveTokenMint('BONK', serpText, { dex });

    expect(resolved!.mint).toBe(BONK_MINT);
    expect(resolved!.liquidityUsd).toBe(200_000); // 100k + 100k
    expect(resolved!.volumeH24).toBe(100_000); // 10k + 90k
  });

  test('symbol collision across DISTINCT mints picks highest liquidity and flags ambiguity', async () => {
    const serpText = 'BONK is trending on Solana';
    const logged: string[] = [];
    const dex = makeDex([
      pair({
        baseToken: { address: FAKE_BONK_MINT, name: 'Bonk Clone', symbol: 'BONK' },
        liquidity: { usd: 40_000 },
        volume: { h24: 200_000 }, // higher volume, but lower liquidity
      }),
      pair({
        baseToken: { address: BONK_MINT, name: 'Bonk', symbol: 'BONK' },
        liquidity: { usd: 500_000 }, // highest liquidity → the real one
        volume: { h24: 90_000 },
      }),
    ]);

    const resolved = await resolveTokenMint('BONK', serpText, {
      dex,
      log: (m) => logged.push(m),
    });

    expect(resolved!.mint).toBe(BONK_MINT);
    expect(resolved!.ambiguous).toBe(true);
    expect(logged.some((m) => m.toLowerCase().includes('ambiguous') || m.includes('BONK'))).toBe(true);
  });

  test('single-mint result is not flagged ambiguous', async () => {
    const serpText = 'BONK is trending on Solana';
    const dex = makeDex([
      pair({ baseToken: { address: BONK_MINT, name: 'Bonk', symbol: 'BONK' } }),
    ]);

    const resolved = await resolveTokenMint('BONK', serpText, { dex });

    expect(resolved!.ambiguous).toBe(false);
  });
});

describe('resolveTokenMint — SERP-trending size floors (Fartcoin regression)', () => {
  // Real mints from the live /latest/dex/search?q=fartcoin response (2026-06).
  const REAL_FARTCOIN = '9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump';
  const FAKE_FARTCOIN = 'HnXDnwTa68tRhLRZdJkVRLAeYrUkCYgFgDavtwD1pump';
  const SPOOF_TVL_A = '4uW1pJLHRtSSoNZtaGuTswPDhaw3jWs8d8PNS2hA95Uv';
  const SPOOF_TVL_B = '3srC8ksB2EiJynMGfk72mDk7joF56Aqz3NjwQEyEki7c';
  const FT = (mint: string) => ({ address: mint, name: 'Fartcoin', symbol: 'Fartcoin' });

  test('picks the real $149M mint, not the $56k copycat surfaced alongside it', async () => {
    const serpText = 'Fartcoin rips as AI memecoins lead Solana today';

    // What /latest/dex/search surfaces: ONE pair per mint. Crucially the REAL
    // Fartcoin shows a near-dead $213 backwater pool, while the copycat shows its
    // only (active) pool — so the search row alone would reject the real coin and
    // admit the fake. The two spoofed-TVL clones show billions in liquidity.
    const searchPairs: DexPair[] = [
      pair({ baseToken: FT(SPOOF_TVL_A), liquidity: { usd: 1_169_752_975 }, volume: { h24: 4 }, marketCap: 1_169_869_959 }),
      pair({ baseToken: FT(SPOOF_TVL_B), liquidity: { usd: 243_378_629 }, volume: { h24: 4 }, marketCap: 633_540_161 }),
      pair({ baseToken: FT(FAKE_FARTCOIN), liquidity: { usd: 21_287 }, volume: { h24: 33_270 }, marketCap: 56_709 }),
      pair({ baseToken: FT(REAL_FARTCOIN), liquidity: { usd: 213 }, volume: { h24: 27 }, marketCap: 140_000_000 }),
    ];

    // What /latest/dex/tokens/{mint} returns: each mint's TRUE aggregated profile.
    const poolsByMint: Record<string, DexPair[]> = {
      [SPOOF_TVL_A]: [pair({ baseToken: FT(SPOOF_TVL_A), liquidity: { usd: 1_169_752_975 }, volume: { h24: 4 }, marketCap: 1_169_869_959 })],
      [SPOOF_TVL_B]: [pair({ baseToken: FT(SPOOF_TVL_B), liquidity: { usd: 243_378_629 }, volume: { h24: 4 }, marketCap: 633_540_161 })],
      [FAKE_FARTCOIN]: [pair({ baseToken: FT(FAKE_FARTCOIN), liquidity: { usd: 21_287 }, volume: { h24: 33_270 }, marketCap: 56_709 })],
      // 30 real pools, summarised: $8M liquidity, ~$6M 24h volume, $149M cap.
      [REAL_FARTCOIN]: [pair({ baseToken: FT(REAL_FARTCOIN), liquidity: { usd: 8_037_685 }, volume: { h24: 5_988_150 }, marketCap: 149_822_553 })],
    };

    const logged: string[] = [];
    const resolved = await resolveTokenMint('Fartcoin', serpText, {
      dex: makeDexSplit(searchPairs, poolsByMint),
      log: (m) => logged.push(m),
    });

    expect(resolved).not.toBeNull();
    expect(resolved!.mint).toBe(REAL_FARTCOIN);
    // The fake is ejected by the market-cap floor; the spoofed-TVL clones by the
    // volume floor — so after the floors only ONE mint remains (not ambiguous).
    expect(resolved!.ambiguous).toBe(false);
    expect(resolved!.marketCapUsd).toBe(149_822_553);
    expect(resolved!.volumeH24).toBe(5_988_150);
  });

  test('rejects a micro-cap copycat below the market-cap floor (no real coin present)', async () => {
    const serpText = 'Fartcoin is trending on Solana';
    // Only the $56k copycat exists; it clears the legacy liquidity/volume floor
    // but a SERP-trending coin cannot be sub-$1M cap, so this resolves to null.
    const dex = makeDex([
      pair({ baseToken: FT(FAKE_FARTCOIN), liquidity: { usd: 21_287 }, volume: { h24: 33_270 }, marketCap: 56_709 }),
    ]);

    const resolved = await resolveTokenMint('Fartcoin', serpText, { dex });

    expect(resolved).toBeNull();
  });

  test('rejects a spoofed-TVL pool with billions in liquidity but no real volume', async () => {
    const serpText = 'Fartcoin is trending on Solana';
    const dex = makeDex([
      pair({ baseToken: FT(SPOOF_TVL_A), liquidity: { usd: 1_169_752_975 }, volume: { h24: 4 }, marketCap: 1_169_869_959 }),
    ]);

    const resolved = await resolveTokenMint('Fartcoin', serpText, { dex });

    expect(resolved).toBeNull();
  });
});

describe('resolveTokenMint — fail-closed', () => {
  test('returns null when Dexscreener returns no pairs (never invents)', async () => {
    const serpText = 'WIF is the new Solana darling';
    const dex = makeDex([]);

    const resolved = await resolveTokenMint('WIF', serpText, { dex });

    expect(resolved).toBeNull();
  });
});
