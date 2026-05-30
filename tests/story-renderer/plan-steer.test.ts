// ── Satisfy app-wide env validation (mirror token-story-renderer.test.ts) ──────
process.env.ACE_API_KEY ??= 'test';
process.env.AGENT_SECRET_KEY_BASE58 ??= 'test';
process.env.CRON_SECRET ??= 'test';
process.env.DATABASE_URL ??= 'https://test.invalid/db';
process.env.DEMO_SECRET ??= 'test';

import { describe, expect, test } from 'bun:test';
import { CostGuard } from '@/cost-guard';
import type { Plan } from '@/modules/director';
import type { NftSpotlights, TokenSpotlights, WalletSpotlights } from '@/spotlight-fetcher';
import type {
  ChatClient,
  ChatCompleteArgs,
  ImageClient,
  RenderStepId,
  SerpClient,
} from '@/story-renderer';

const { renderStory, renderNftStory, renderTokenStory } = await import('@/story-renderer');

// ── Fixtures ───────────────────────────────────────────────────────────────────

const WALLET = 'B1aLAAe4vW8nSQCetXnYqJfRxzTjnbooasVZjUUtsKf';

const WALLET_SPOTLIGHTS: WalletSpotlights = {
  pubkey: WALLET,
  balanceLamports: BigInt(1_234_567_890),
  txCountSampled: 50,
  firstSeen: { signature: 'sigOldest', slot: 100, blockTime: 1_584_316_800 },
  latestActivityBlockTime: 1_730_000_000,
  topCounterparties: ['CounterA', 'CounterB', 'CounterC'],
  peakTx: { signature: 'sigPeak', ixCount: 47, feeLamports: 41_000, blockTime: 1_725_000_000 },
  failedTxSample: { signature: 'sigBad', blockTime: 1_700_000_000 },
  tokenAccountsCount: 12,
  nftCount: 3,
  rpcCallsUsed: 14,
};

const NFT_MINT = 'BzG3LcMaskBearer4267xKqPnRvSwTzAa9BCdEfGhJk';

const NFT_SPOTLIGHTS: NftSpotlights = {
  mint: NFT_MINT,
  name: 'Mask Bearer #4267',
  collectionName: 'Mask Bearers',
  traits: [{ label: 'Mask', value: 'Crimson Hex' }],
  currentOwner: 'OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO',
  imageUri: 'https://arweave.net/fake-image',
  provenance: [
    { signature: 'sig1', blockTime: 1_600_000_000, slot: 100, acquired: 'mint', counterparty: null },
  ],
  rpcCallsUsed: 4,
};

const BONK_MINT = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';

const TOKEN_SPOTLIGHTS: TokenSpotlights = {
  mint: BONK_MINT,
  ticker: 'BONK',
  name: 'Bonk',
  decimals: 5,
  supplyRaw: BigInt('92700000000000000'),
  supplyUiString: '927,000,000,000',
  mintRenounced: true,
  freezeRenounced: false,
  launchedAt: 1671926400,
  spotPriceUsd: 0.00003,
  mcapDisplay: '$27.81M',
  liquidityUsd: 250_000,
  volume24h: 1_200_000,
  priceChange24h: -3.5,
  imageUri: 'https://example.com/bonk.png',
  sourceCallsUsed: 3,
};

const FIVE_SECTIONS = [
  { title: 'Origin', body: 'A funded address awakens in 2020 quiet.' },
  { title: 'Companions', body: 'Three counterparties recur like leitmotifs.' },
  { title: 'Eras', body: 'Five distinct activity eras unfold across years.' },
  { title: 'The Crowning', body: 'A 47-instruction transaction crowns the wallet.' },
  { title: 'The Drama', body: 'A failed simulation, near-miss preserved on-chain.' },
];

const NFT_CHAT_DATA = {
  title: 'Mask Bearer №4267',
  subtitle: 'Minted in the bull, held through the bear.',
  traits: [{ label: 'Mask', value: 'Crimson Hex' }],
  provenance: [
    { short: 'Minter', duration: '0d', acquired: 'mint' as const, note: 'Mint · first wave' },
  ],
  drama: 'October night: the NFT moved to a drainer wallet. Eight hours of silence.',
  storyImagePrompt: 'Desert dawn, geometric mask shapes, no faces.',
  verdict: 'Held, lost, and recovered — rarer than rarity.',
};

// ── Fakes ────────────────────────────────────────────────────────────────────

function makeChat(capture?: ChatCompleteArgs<unknown>[]): ChatClient {
  return {
    async complete<T>(args: ChatCompleteArgs<T>) {
      capture?.push(args as ChatCompleteArgs<unknown>);
      const data = {
        title: 'The Architect of Quiet Bridges',
        subtitle: 'A wallet that arrived in the silence of 2020.',
        stats: [
          { label: 'First seen', value: 'Mar 16, 2020' },
          { label: 'Txs', value: '50' },
          { label: 'SOL flowed', value: '1.23' },
        ],
        sections: FIVE_SECTIONS,
        verdict: 'A wallet that does not perform — it endures.',
        heroImagePrompt: 'A vast desert at dawn, weathered stone bridges, no figures.',
        // Token render path requires the structured origin beat; harmless for
        // wallet/nft schemas (zod strips the unknown key).
        origin: { founder: '', firstMint: '', keyEvents: [] },
      };
      const parsed = args.schema.parse(data) as T;
      return { data: parsed, promptTokens: 1234, completionTokens: 567, model: 'mock-chat-model' };
    },
  };
}

function makeNftChat(capture?: ChatCompleteArgs<unknown>[]): ChatClient {
  return {
    async complete<T>(args: ChatCompleteArgs<T>) {
      capture?.push(args as ChatCompleteArgs<unknown>);
      const parsed = args.schema.parse(NFT_CHAT_DATA) as T;
      return { data: parsed, promptTokens: 800, completionTokens: 300, model: 'mock-chat' };
    },
  };
}

function makeImage(capture?: string[]): ImageClient {
  return {
    async generate(prompt) {
      capture?.push(prompt);
      return { url: 'https://images.example/abc.jpg', model: 'mock-image-model' };
    },
  };
}

function makeSerp(opts?: { snippets?: string[]; capture?: string[] }): SerpClient {
  return {
    async search(query) {
      opts?.capture?.push(query);
      return { snippets: opts?.snippets ?? ['Snippet one.', 'Snippet two.'] };
    },
  };
}

function makeProgress(events: Array<[RenderStepId, 'active' | 'done']>) {
  return (id: RenderStepId, status: 'active' | 'done') => {
    events.push([id, status]);
  };
}

function plan(overrides: Partial<Plan> = {}): Plan {
  return { tone: 'Epic', serpQuery: '', imageStyle: '', emphasis: '', ...overrides };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('renderStory wallet — Plan steer', () => {
  test('plan.tone overrides the tone-only arg in the chat prompt and story', async () => {
    const capture: ChatCompleteArgs<unknown>[] = [];
    const { story } = await renderStory(WALLET_SPOTLIGHTS, 'wallet', 'Epic', {
      chat: makeChat(capture),
      image: makeImage(),
      costGuard: new CostGuard(100),
    }, plan({ tone: 'Tragedy' }));
    expect(story.tone).toBe('Tragedy');
    expect(capture[0].user).toContain('tone: Tragedy');
  });

  test('plan.serpQuery + serp client emits multi-layer search + serp receipts and injects snippets', async () => {
    const capture: ChatCompleteArgs<unknown>[] = [];
    const serpQueries: string[] = [];
    const events: Array<[RenderStepId, 'active' | 'done']> = [];
    const { receipts } = await renderStory(WALLET_SPOTLIGHTS, 'wallet', 'Epic', {
      chat: makeChat(capture),
      image: makeImage(),
      costGuard: new CostGuard(100),
      serp: makeSerp({ snippets: ['Whale wallet context.'], capture: serpQueries }),
      onProgress: makeProgress(events),
    }, plan({ serpQuery: 'famous solana whale' }));
    // Multi-layer SERP (ADR 0016 D): the plan query leads, an on-chain-context
    // facet trails — both fire inside ONE search-phase progress pair.
    expect(serpQueries).toEqual([
      'famous solana whale',
      'famous solana whale Solana wallet on-chain activity',
    ]);
    expect(events).toEqual([
      ['search', 'active'],
      ['search', 'done'],
      ['write', 'active'],
      ['write', 'done'],
      ['paint', 'active'],
      ['paint', 'done'],
    ]);
    const serpReceipts = receipts.filter((r) => r.kind === 'serp');
    expect(serpReceipts).toHaveLength(2);
    if (serpReceipts[0].kind === 'serp') {
      expect(serpReceipts[0].query).toBe('famous solana whale');
      expect(serpReceipts[0].snippetCount).toBe(1);
    }
    expect(capture[0].user).toContain('Whale wallet context.');
  });

  test('no plan: briefless wallet falls back to the pubkey SERP facet + receipt (ADR 0016 D)', async () => {
    const serpQueries: string[] = [];
    const events: Array<[RenderStepId, 'active' | 'done']> = [];
    const { receipts } = await renderStory(WALLET_SPOTLIGHTS, 'wallet', 'Epic', {
      chat: makeChat(),
      image: makeImage(),
      costGuard: new CostGuard(100),
      serp: makeSerp({ capture: serpQueries }),
      onProgress: makeProgress(events),
    });
    // The wallet's only web-searchable handle — its pubkey — is the base facet,
    // so the SERP leg still settles + receipts (no silent skip).
    expect(serpQueries).toEqual([`${WALLET} Solana wallet`]);
    expect(events.some(([id]) => id === 'search')).toBe(true);
    expect(receipts.filter((r) => r.kind === 'serp')).toHaveLength(1);
  });

  test('empty plan.serpQuery: still falls back to the pubkey SERP facet', async () => {
    const serpQueries: string[] = [];
    const events: Array<[RenderStepId, 'active' | 'done']> = [];
    const { receipts } = await renderStory(WALLET_SPOTLIGHTS, 'wallet', 'Epic', {
      chat: makeChat(),
      image: makeImage(),
      costGuard: new CostGuard(100),
      serp: makeSerp({ capture: serpQueries }),
      onProgress: makeProgress(events),
    }, plan({ serpQuery: '' }));
    expect(serpQueries).toEqual([`${WALLET} Solana wallet`]);
    expect(events.some(([id]) => id === 'search')).toBe(true);
    expect(receipts.filter((r) => r.kind === 'serp')).toHaveLength(1);
  });

  test('no serp client: no search and no serp receipt', async () => {
    const events: Array<[RenderStepId, 'active' | 'done']> = [];
    const { receipts } = await renderStory(WALLET_SPOTLIGHTS, 'wallet', 'Epic', {
      chat: makeChat(),
      image: makeImage(),
      costGuard: new CostGuard(100),
      onProgress: makeProgress(events),
    });
    expect(events.some(([id]) => id === 'search')).toBe(false);
    expect(receipts.some((r) => r.kind === 'serp')).toBe(false);
  });

  test('plan.imageStyle is prepended to the hero image prompt', async () => {
    const imgPrompts: string[] = [];
    await renderStory(WALLET_SPOTLIGHTS, 'wallet', 'Epic', {
      chat: makeChat(),
      image: makeImage(imgPrompts),
      costGuard: new CostGuard(100),
    }, plan({ imageStyle: 'cyberpunk neon' }));
    expect(imgPrompts).toHaveLength(1);
    expect(imgPrompts[0].startsWith('cyberpunk neon ')).toBe(true);
  });

  test('plan.emphasis is injected into the chat user prompt', async () => {
    const capture: ChatCompleteArgs<unknown>[] = [];
    await renderStory(WALLET_SPOTLIGHTS, 'wallet', 'Epic', {
      chat: makeChat(capture),
      image: makeImage(),
      costGuard: new CostGuard(100),
    }, plan({ emphasis: 'focus on the failed-tx near-miss' }));
    expect(capture[0].user).toContain('Emphasis: focus on the failed-tx near-miss');
  });
});

describe('renderNftStory — Plan steer', () => {
  test('multi-layer SERP: plan query leads, name/collection facets trail', async () => {
    const serpQueries: string[] = [];
    const { receipts } = await renderNftStory(NFT_SPOTLIGHTS, 'Elegy', {
      chat: makeNftChat(),
      image: makeImage(),
      costGuard: new CostGuard(100),
      serp: makeSerp({ capture: serpQueries }),
    }, plan({ serpQuery: 'mask bearers collection' }));
    // Multi-layer SERP (ADR 0016 D): the plan query leads; name/collection
    // identity + provenance facets trail so the web context is broad.
    expect(serpQueries).toEqual([
      'mask bearers collection',
      'Mask Bearer #4267 Mask Bearers NFT collection',
      'Mask Bearer #4267 Mask Bearers NFT provenance history mint',
    ]);
    expect(receipts.filter((r) => r.kind === 'serp')).toHaveLength(3);

    // Briefless render still searches by name/collection (no Director query).
    const serpQueries2: string[] = [];
    const { receipts: receipts2 } = await renderNftStory(NFT_SPOTLIGHTS, 'Elegy', {
      chat: makeNftChat(),
      image: makeImage(),
      costGuard: new CostGuard(100),
      serp: makeSerp({ capture: serpQueries2 }),
    });
    expect(serpQueries2).toEqual([
      'Mask Bearer #4267 Mask Bearers NFT collection',
      'Mask Bearer #4267 Mask Bearers NFT provenance history mint',
    ]);
    expect(receipts2.filter((r) => r.kind === 'serp')).toHaveLength(2);
  });

  test('plan.tone overrides and imageStyle prepends', async () => {
    const imgPrompts: string[] = [];
    const { story } = await renderNftStory(NFT_SPOTLIGHTS, 'Elegy', {
      chat: makeNftChat(),
      image: makeImage(imgPrompts),
      costGuard: new CostGuard(100),
    }, plan({ tone: 'Comedy', imageStyle: 'baroque oil' }));
    expect(story.tone).toBe('Comedy');
    expect(imgPrompts[0].startsWith('baroque oil ')).toBe(true);
  });
});

describe('renderTokenStory — Plan steer', () => {
  test('plan.serpQuery overrides the default Solana-token query', async () => {
    const serpQueries: string[] = [];
    const { receipts } = await renderTokenStory(TOKEN_SPOTLIGHTS, 'Comedy', {
      chat: makeChat(),
      image: makeImage(),
      costGuard: new CostGuard(100),
      serp: makeSerp({ capture: serpQueries }),
    }, plan({ serpQuery: 'bonk rug rumor 2023' }));
    // Multi-layer SERP: the plan query steers the events slot (and leads), the origin
    // and facet queries trail to feed the lineage + context beats.
    expect(serpQueries).toHaveLength(5);
    expect(serpQueries[0]).toBe('bonk rug rumor 2023');
    expect(serpQueries[1]).toContain('founder');
    const serp = receipts.find((r) => r.kind === 'serp');
    if (serp?.kind === 'serp') expect(serp.query).toBe('bonk rug rumor 2023');
  });

  test('no plan: keeps today default query containing "Solana token"', async () => {
    const serpQueries: string[] = [];
    await renderTokenStory(TOKEN_SPOTLIGHTS, 'Comedy', {
      chat: makeChat(),
      image: makeImage(),
      costGuard: new CostGuard(100),
      serp: makeSerp({ capture: serpQueries }),
    });
    expect(serpQueries[0]).toContain('Solana token');
  });

  test('plan.imageStyle prepends and plan.emphasis injected', async () => {
    const capture: ChatCompleteArgs<unknown>[] = [];
    const imgPrompts: string[] = [];
    await renderTokenStory(TOKEN_SPOTLIGHTS, 'Comedy', {
      chat: makeChat(capture),
      image: makeImage(imgPrompts),
      costGuard: new CostGuard(100),
      serp: makeSerp(),
    }, plan({ imageStyle: 'vaporwave', emphasis: 'the airdrop coordination' }));
    expect(imgPrompts[0].startsWith('vaporwave ')).toBe(true);
    expect(capture[0].user).toContain('Emphasis: the airdrop coordination');
  });

  test('news-seeded plan.serpQuery coexists with the asserted FACTS spine (ADR 0014)', async () => {
    const capture: ChatCompleteArgs<unknown>[] = [];
    const serpQueries: string[] = [];
    await renderTokenStory(TOKEN_SPOTLIGHTS, 'Comedy', {
      chat: makeChat(capture),
      image: makeImage(),
      costGuard: new CostGuard(100),
      serp: makeSerp({ snippets: ['Exchange listing rumor drives volume.'], capture: serpQueries }),
    }, plan({ serpQuery: 'bonk binance listing rumor', emphasis: 'the listing rumor' }));
    // the news-seeded query leads the multi-layer SERP; the origin query trails
    expect(serpQueries).toHaveLength(5);
    expect(serpQueries[0]).toBe('bonk binance listing rumor');
    expect(serpQueries[1]).toContain('founder');
    const user = capture[0].user;
    // news context + emphasis foregrounded but attributed; FACTS still asserted
    expect(user).toContain('Exchange listing rumor drives volume.');
    expect(user).toContain('Emphasis: the listing rumor');
    expect(user).toContain('MCAP=$27.81M');
    expect(user).toContain('ATTRIBUTED');
  });
});
