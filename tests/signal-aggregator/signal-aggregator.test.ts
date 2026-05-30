import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import type { DexPair, DexscreenerClient } from '@/dexscreener-resolver';
import {
  aggregateSignals,
  buildNewsQuery,
  NoFreshCandidatesError,
  NoResolvableCandidatesError,
  pickSchema,
  type AggregatorChatClient,
  type AggregatorDeps,
  type RenderedSubjectStore,
  type SerpClient,
} from '@/signal-aggregator';

// ── Fixture mints (valid base58, 44 chars) ────────────────────────────────────

const MINT_A = 'B1aLAAe4vW8nSQCetXnYqJfRxzTjnbooasVZjUUtsKf';
const MINT_B = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const MINT_C = 'CuiDdffnVnTkn9G2TtNH6sP7NPAyY4iMaHJwLaHfFhun';

// ── Mock factories ────────────────────────────────────────────────────────────

// SERP content is shown to the LLM as context only; resolution is grounded on the
// chat-supplied sourceHitText, so an empty SERP is fine for these unit tests.
function emptySerpClient(): SerpClient {
  return { async search() { return []; } };
}

function pair(symbol: string, mint: string, liq = 50_000, vol = 20_000): DexPair {
  return {
    chainId: 'solana',
    dexId: 'raydium',
    pairAddress: `pair_${mint}`,
    baseToken: { address: mint, name: symbol, symbol },
    liquidity: { usd: liq },
    volume: { h24: vol },
    // Above the resolver's market-cap floor so these fixtures resolve.
    marketCap: 50_000_000,
  };
}

// Maps an exact ticker → the pairs Dexscreener would return for it. `pairsForMint`
// derives a mint's aggregated pools from the same fixtures (search ⊇ those pools).
function makeDexClient(byTicker: Record<string, DexPair[]>): DexscreenerClient {
  const all = Object.values(byTicker).flat();
  return {
    async search(ticker) {
      return byTicker[ticker] ?? [];
    },
    async pairsForMint(mint) {
      return all.filter((p) => p.baseToken.address === mint);
    },
  };
}

type ChatCandidate = { ticker: string; sourceHitText: string; rationale: string };

function makeChatClient(candidates: ChatCandidate[], pickIndex = 0): AggregatorChatClient {
  return {
    async complete<T>({ schema }: { system: string; user: string; schema: z.ZodType<T> }) {
      const raw = { candidates, pick: candidates[pickIndex] };
      return { data: schema.parse(raw) as T };
    },
  };
}

function makeRenderedStore(rendered: string[]): RenderedSubjectStore {
  const set = new Set(rendered);
  return { async hasBeenRendered(id) { return set.has(id); } };
}

function neverRendered(): RenderedSubjectStore {
  return { async hasBeenRendered() { return false; } };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('aggregateSignals — resolves chat tickers to real mints', () => {
  test('chat ticker resolves to a token candidate (kind="token", identifier=mint)', async () => {
    const deps: AggregatorDeps = {
      serp: emptySerpClient(),
      chat: makeChatClient([
        { ticker: 'BONK', sourceHitText: 'BONK is trending today', rationale: 'viral memecoin' },
      ]),
      dex: makeDexClient({ BONK: [pair('BONK', MINT_A)] }),
      recentSubjects: neverRendered(),
    };
    const { candidates, pick } = await aggregateSignals(deps);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].kind).toBe('token');
    expect(candidates[0].identifier).toBe(MINT_A);
    expect(candidates[0].source).toBe('chat');
    expect(candidates[0].sourceHitText).toBe('BONK is trending today');
    expect(candidates[0].newsQuery).toBe('BONK BONK is trending today');
    expect(pick.identifier).toBe(MINT_A);
    expect(pick.kind).toBe('token');
    expect(pick.sourceHitText).toBe('BONK is trending today');
    expect(pick.newsQuery).toBe('BONK BONK is trending today');
  });

  test('unresolvable ticker (no Dexscreener pair) is dropped fail-closed', async () => {
    const deps: AggregatorDeps = {
      serp: emptySerpClient(),
      chat: makeChatClient([
        { ticker: 'BONK', sourceHitText: 'BONK trending', rationale: 'real' },
        { ticker: 'FAKE', sourceHitText: 'FAKE trending', rationale: 'invented' },
      ]),
      dex: makeDexClient({ BONK: [pair('BONK', MINT_A)] }), // FAKE → []
      recentSubjects: neverRendered(),
    };
    const { candidates } = await aggregateSignals(deps);
    expect(candidates.map((c) => c.identifier)).toEqual([MINT_A]);
  });

  test('ticker not present in its sourceHitText is rejected (anti-hallucination gate)', async () => {
    const deps: AggregatorDeps = {
      serp: emptySerpClient(),
      chat: makeChatClient([
        { ticker: 'BONK', sourceHitText: 'some unrelated headline', rationale: 'ungrounded' },
      ]),
      dex: makeDexClient({ BONK: [pair('BONK', MINT_A)] }),
      recentSubjects: neverRendered(),
    };
    await expect(aggregateSignals(deps)).rejects.toBeInstanceOf(NoResolvableCandidatesError);
  });

  test('throws NoResolvableCandidatesError when no ticker resolves', async () => {
    const deps: AggregatorDeps = {
      serp: emptySerpClient(),
      chat: makeChatClient([
        { ticker: 'FAKE', sourceHitText: 'FAKE trending', rationale: 'invented' },
      ]),
      dex: makeDexClient({}),
      recentSubjects: neverRendered(),
    };
    await expect(aggregateSignals(deps)).rejects.toBeInstanceOf(NoResolvableCandidatesError);
  });

  test('two tickers resolving to the same mint appear once', async () => {
    const deps: AggregatorDeps = {
      serp: emptySerpClient(),
      chat: makeChatClient([
        { ticker: 'BONK', sourceHitText: 'BONK trending', rationale: 'a' },
        { ticker: 'bonk', sourceHitText: 'bonk trending', rationale: 'b' },
      ]),
      dex: makeDexClient({ BONK: [pair('BONK', MINT_A)], bonk: [pair('bonk', MINT_A)] }),
      recentSubjects: neverRendered(),
    };
    const { candidates } = await aggregateSignals(deps);
    expect(candidates.filter((c) => c.identifier === MINT_A)).toHaveLength(1);
  });
});

describe('aggregateSignals — dedup against recently rendered subjects', () => {
  test('pick is not a mint rendered within the dedup window', async () => {
    const deps: AggregatorDeps = {
      serp: emptySerpClient(),
      chat: makeChatClient(
        [
          { ticker: 'BONK', sourceHitText: 'BONK trending', rationale: 'rendered' },
          { ticker: 'WIF', sourceHitText: 'WIF trending', rationale: 'fresh' },
        ],
        0, // chat picks BONK
      ),
      dex: makeDexClient({ BONK: [pair('BONK', MINT_A)], WIF: [pair('WIF', MINT_B)] }),
      recentSubjects: makeRenderedStore([MINT_A]),
    };
    const { pick } = await aggregateSignals(deps);
    expect(pick.identifier).toBe(MINT_B);
    // Provenance follows the chosen survivor (WIF), not the deduped chat pick (BONK).
    expect(pick.sourceHitText).toBe('WIF trending');
    expect(pick.newsQuery).toBe('WIF WIF trending');
  });

  test('throws NoFreshCandidatesError when all resolved mints were recently rendered', async () => {
    const deps: AggregatorDeps = {
      serp: emptySerpClient(),
      chat: makeChatClient([
        { ticker: 'BONK', sourceHitText: 'BONK trending', rationale: 'only' },
      ]),
      dex: makeDexClient({ BONK: [pair('BONK', MINT_A)] }),
      recentSubjects: makeRenderedStore([MINT_A, MINT_B, MINT_C]),
    };
    await expect(aggregateSignals(deps)).rejects.toBeInstanceOf(NoFreshCandidatesError);
  });
});

describe('aggregateSignals — pick membership and schema', () => {
  test('pick conforms to pickSchema with kind "token"', async () => {
    const deps: AggregatorDeps = {
      serp: emptySerpClient(),
      chat: makeChatClient([
        { ticker: 'BONK', sourceHitText: 'BONK trending', rationale: 'great' },
      ]),
      dex: makeDexClient({ BONK: [pair('BONK', MINT_A)] }),
      recentSubjects: neverRendered(),
    };
    const { pick } = await aggregateSignals(deps);
    expect(() => pickSchema.parse(pick)).not.toThrow();
    expect(pick.kind).toBe('token');
  });

  test('pick identifier is present in the candidate set', async () => {
    const deps: AggregatorDeps = {
      serp: emptySerpClient(),
      chat: makeChatClient([
        { ticker: 'BONK', sourceHitText: 'BONK trending', rationale: 'pick me' },
      ]),
      dex: makeDexClient({ BONK: [pair('BONK', MINT_A)] }),
      recentSubjects: neverRendered(),
    };
    const { candidates, pick } = await aggregateSignals(deps);
    expect(candidates.some((c) => c.identifier === pick.identifier)).toBe(true);
  });

  test('uses custom dedupeWindowDays parameter', async () => {
    let capturedDays = -1;
    const trackingStore: RenderedSubjectStore = {
      async hasBeenRendered(_id, days) {
        capturedDays = days;
        return false;
      },
    };
    const deps: AggregatorDeps = {
      serp: emptySerpClient(),
      chat: makeChatClient([
        { ticker: 'BONK', sourceHitText: 'BONK trending', rationale: 'test' },
      ]),
      dex: makeDexClient({ BONK: [pair('BONK', MINT_A)] }),
      recentSubjects: trackingStore,
      dedupeWindowDays: 14,
    };
    await aggregateSignals(deps);
    expect(capturedDays).toBe(14);
  });
});

describe('buildNewsQuery — deterministic news-seeded query', () => {
  test('prefixes the ticker and keeps the first ~6 salient words of the headline', () => {
    expect(buildNewsQuery('BONK', 'BONK surges 40% after exchange listing news today extra')).toBe(
      'BONK BONK surges 40% after exchange listing',
    );
  });

  test('collapses irregular whitespace and trims', () => {
    expect(buildNewsQuery('WIF', '  WIF\tjumps   on   memecoin   rotation  ')).toBe(
      'WIF WIF jumps on memecoin rotation',
    );
  });

  test('omits the headline part when sourceHitText is empty', () => {
    expect(buildNewsQuery('PEPE', '')).toBe('PEPE');
  });

  test('omits the ticker part when ticker is empty', () => {
    expect(buildNewsQuery('', 'something trending')).toBe('something trending');
  });

  test('is deterministic for identical inputs', () => {
    const a = buildNewsQuery('BONK', 'BONK is trending today across crypto twitter feeds');
    const b = buildNewsQuery('BONK', 'BONK is trending today across crypto twitter feeds');
    expect(a).toBe(b);
  });
});
