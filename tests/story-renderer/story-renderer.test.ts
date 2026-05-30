import { describe, expect, test } from 'bun:test';
import { CONTENT_POLICY } from '@/content-policy';
import { CostCapExceededError, CostGuard, RENDER_COST_USDC } from '@/cost-guard';
import type { NftSpotlights, WalletSpotlights } from '@/spotlight-fetcher';
import {
  type ChatClient,
  type ChatCompleteArgs,
  type ImageClient,
  type Tone,
  nftStorySchema,
  renderNftStory,
  renderStory,
  walletStorySchema,
} from '@/story-renderer';

const WALLET = 'B1aLAAe4vW8nSQCetXnYqJfRxzTjnbooasVZjUUtsKf';

const SPOTLIGHTS: WalletSpotlights = {
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

const FIVE_SECTIONS = [
  { title: 'Origin', body: 'A funded address awakens in 2020 quiet.' },
  { title: 'Companions', body: 'Three counterparties recur like leitmotifs.' },
  { title: 'Eras', body: 'Five distinct activity eras unfold across years.' },
  { title: 'The Crowning', body: 'A 47-instruction transaction crowns the wallet.' },
  { title: 'The Drama', body: 'A failed simulation, near-miss preserved on-chain.' },
];

function makeChat(opts?: {
  capture?: ChatCompleteArgs<unknown>[];
  override?: Partial<{
    title: string;
    subtitle: string;
    stats: Array<{ label: string; value: string }>;
    sections: Array<{ title: string; body: string }>;
    verdict: string;
    heroImagePrompt: string;
  }>;
}): ChatClient {
  return {
    async complete<T>(args: ChatCompleteArgs<T>) {
      opts?.capture?.push(args as ChatCompleteArgs<unknown>);
      const data = {
        title: opts?.override?.title ?? 'The Architect of Quiet Bridges',
        subtitle:
          opts?.override?.subtitle ?? 'A wallet that arrived in the silence of 2020 and never left.',
        stats: opts?.override?.stats ?? [
          { label: 'First seen', value: 'Mar 16, 2020' },
          { label: 'Txs', value: '50' },
          { label: 'SOL flowed', value: '1.23' },
          { label: 'Eras', value: '5' },
        ],
        sections: opts?.override?.sections ?? FIVE_SECTIONS,
        verdict: opts?.override?.verdict ?? 'A wallet that does not perform — it endures.',
        heroImagePrompt:
          opts?.override?.heroImagePrompt ??
          'A vast desert at dawn, weathered stone bridges spanning silent canyons, ornamental script as visual texture, no figures.',
      };
      const parsed = args.schema.parse(data) as T;
      return {
        data: parsed,
        promptTokens: 1234,
        completionTokens: 567,
        model: 'mock-chat-model',
      };
    },
  };
}

function makeImage(opts?: { url?: string; capture?: string[] }): ImageClient {
  return {
    async generate(prompt) {
      opts?.capture?.push(prompt);
      return {
        url: opts?.url ?? 'https://images.example/abc.jpg',
        model: 'mock-image-model',
      };
    },
  };
}

describe('renderStory — wallet branch', () => {
  test('passes CONTENT_POLICY as the chat system prompt', async () => {
    const capture: ChatCompleteArgs<unknown>[] = [];
    await renderStory(SPOTLIGHTS, 'wallet', 'Epic', {
      chat: makeChat({ capture }),
      image: makeImage(),
    });
    expect(capture).toHaveLength(1);
    expect(capture[0].system).toContain(CONTENT_POLICY);
  });

  test('includes spotlight data in the chat user prompt', async () => {
    const capture: ChatCompleteArgs<unknown>[] = [];
    await renderStory(SPOTLIGHTS, 'wallet', 'Epic', {
      chat: makeChat({ capture }),
      image: makeImage(),
    });
    const user = capture[0].user;
    expect(user).toContain(WALLET);
    expect(user).toContain('47');
    expect(user).toContain('CounterA');
    expect(user).toContain('Epic');
  });

  test('returns a story validated against the wallet schema', async () => {
    const { story } = await renderStory(SPOTLIGHTS, 'wallet', 'Epic', {
      chat: makeChat(),
      image: makeImage(),
    });
    const parsed = walletStorySchema.parse(story);
    expect(parsed.kind).toBe('wallet');
    expect(parsed.tone).toBe('Epic');
    expect(parsed.input).toBe(WALLET);
    expect(parsed.sections).toHaveLength(5);
    expect(parsed.heroImageUrl).toBe('https://images.example/abc.jpg');
  });

  test('uses the chat-produced heroImagePrompt to generate the hero image', async () => {
    const captureImage: string[] = [];
    const customPrompt = 'A specific cinematic prompt for hero image.';
    await renderStory(SPOTLIGHTS, 'wallet', 'Epic', {
      chat: makeChat({ override: { heroImagePrompt: customPrompt } }),
      image: makeImage({ capture: captureImage, url: 'https://images.example/custom.jpg' }),
    });
    expect(captureImage).toEqual([customPrompt]);
  });

  test('returns receipts for the llm + image calls', async () => {
    const { receipts } = await renderStory(SPOTLIGHTS, 'wallet', 'Epic', {
      chat: makeChat(),
      image: makeImage(),
    });
    const llmReceipt = receipts.find((r) => r.kind === 'llm');
    const imgReceipt = receipts.find((r) => r.kind === 'image');
    expect(llmReceipt).toBeDefined();
    expect(imgReceipt).toBeDefined();
    if (llmReceipt?.kind === 'llm') {
      expect(llmReceipt.model).toBe('mock-chat-model');
      expect(llmReceipt.promptTokens).toBe(1234);
      expect(llmReceipt.completionTokens).toBe(567);
    }
    if (imgReceipt?.kind === 'image') {
      expect(imgReceipt.model).toBe('mock-image-model');
      expect(imgReceipt.url).toBe('https://images.example/abc.jpg');
    }
  });

  test('rejects chat output with wrong section count', async () => {
    const badSections = FIVE_SECTIONS.slice(0, 3);
    await expect(
      renderStory(SPOTLIGHTS, 'wallet', 'Epic', {
        chat: makeChat({ override: { sections: badSections } }),
        image: makeImage(),
      }),
    ).rejects.toThrow();
  });

  test('passes the requested tone through to the rendered story', async () => {
    const tones: Tone[] = ['Tragedy', 'Comedy', 'Epic', 'Elegy', 'Forensic'];
    for (const tone of tones) {
      const { story } = await renderStory(SPOTLIGHTS, 'wallet', tone, {
        chat: makeChat(),
        image: makeImage(),
        costGuard: new CostGuard(10.0),
      });
      expect(story.tone).toBe(tone);
    }
  });
});

// ─── renderNftStory ──────────────────────────────────────────────────────────

const NFT_MINT = 'BzG3LcMaskBearer4267xKqPnRvSwTzAa9BCdEfGhJk';

const NFT_SPOTLIGHTS: NftSpotlights = {
  mint: NFT_MINT,
  name: 'Mask Bearer #4267',
  collectionName: 'Mask Bearers',
  traits: [
    { label: 'Mask', value: 'Crimson Hex' },
    { label: 'Robe', value: 'Indigo Wave' },
  ],
  currentOwner: 'OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO',
  imageUri: 'https://arweave.net/fake-image',
  provenance: [
    { signature: 'sig1', blockTime: 1_600_000_000, slot: 100, acquired: 'mint', counterparty: null },
    { signature: 'sig2', blockTime: 1_610_000_000, slot: 200, acquired: 'buy', counterparty: 'BuyerWallet1111111111111111111111111111111111' },
  ],
  rpcCallsUsed: 4,
};

const NFT_CHAT_DATA = {
  title: 'Mask Bearer №4267',
  subtitle: 'Minted in the bull, held through the bear.',
  traits: [
    { label: 'Mask', value: 'Crimson Hex' },
    { label: 'Robe', value: 'Indigo Wave' },
  ],
  provenance: [
    { short: 'Minter', duration: '0d', acquired: 'mint' as const, note: 'Mint · first wave', price: '4.2 SOL' },
    { short: 'BuyerWallet…1111', duration: '11d', acquired: 'buy' as const, note: 'First flip', price: '6.8 SOL' },
  ],
  drama: 'October night: the NFT moved to a drainer wallet. Eight hours of silence. Then recovery.',
  storyImagePrompt: 'Desert dawn, geometric mask shapes, no faces, ornamental script, amber hues.',
  verdict: 'Not the rarest. But held, lost, and recovered — rarer than rarity.',
};

function makeNftChat(opts?: {
  capture?: ChatCompleteArgs<unknown>[];
  override?: Partial<typeof NFT_CHAT_DATA>;
}): ChatClient {
  return {
    async complete<T>(args: ChatCompleteArgs<T>) {
      opts?.capture?.push(args as ChatCompleteArgs<unknown>);
      const data = { ...NFT_CHAT_DATA, ...opts?.override };
      const parsed = args.schema.parse(data) as T;
      return { data: parsed, promptTokens: 800, completionTokens: 300, model: 'mock-chat' };
    },
  };
}

describe('renderNftStory — NFT branch', () => {
  test('passes CONTENT_POLICY as the chat system prompt', async () => {
    const capture: ChatCompleteArgs<unknown>[] = [];
    await renderNftStory(NFT_SPOTLIGHTS, 'Elegy', { chat: makeNftChat({ capture }), image: makeImage() });
    expect(capture[0].system).toContain(CONTENT_POLICY);
  });

  test('includes mint address and name in the chat user prompt', async () => {
    const capture: ChatCompleteArgs<unknown>[] = [];
    await renderNftStory(NFT_SPOTLIGHTS, 'Elegy', { chat: makeNftChat({ capture }), image: makeImage() });
    const user = capture[0].user;
    expect(user).toContain(NFT_MINT);
    expect(user).toContain('Mask Bearer #4267');
    expect(user).toContain('Elegy');
  });

  test('returns a story validated against the nft schema', async () => {
    const { story } = await renderNftStory(NFT_SPOTLIGHTS, 'Elegy', {
      chat: makeNftChat(),
      image: makeImage(),
    });
    const parsed = nftStorySchema.parse(story);
    expect(parsed.kind).toBe('nft');
    expect(parsed.tone).toBe('Elegy');
    expect(parsed.input).toBe(NFT_MINT);
    expect(parsed.name).toBe('Mask Bearer #4267');
    expect(parsed.collectionName).toBe('Mask Bearers');
    expect(parsed.storyImageUrl).toBe('https://images.example/abc.jpg');
  });

  test('uses the chat-produced storyImagePrompt to generate the banner image', async () => {
    const captureImage: string[] = [];
    const customPrompt = 'Ancient desert ruins, geometric patterns, no living beings.';
    await renderNftStory(NFT_SPOTLIGHTS, 'Elegy', {
      chat: makeNftChat({ override: { storyImagePrompt: customPrompt } }),
      image: makeImage({ capture: captureImage }),
    });
    expect(captureImage).toEqual([customPrompt]);
  });

  test('returns llm + image receipts', async () => {
    const { receipts } = await renderNftStory(NFT_SPOTLIGHTS, 'Elegy', {
      chat: makeNftChat(),
      image: makeImage(),
    });
    const llmReceipt = receipts.find((r) => r.kind === 'llm');
    const imgReceipt = receipts.find((r) => r.kind === 'image');
    expect(llmReceipt).toBeDefined();
    expect(imgReceipt).toBeDefined();
    if (llmReceipt?.kind === 'llm') {
      expect(llmReceipt.model).toBe('mock-chat');
    }
  });

  test('passes the requested tone through to the rendered story', async () => {
    const { story } = await renderNftStory(NFT_SPOTLIGHTS, 'Tragedy', {
      chat: makeNftChat(),
      image: makeImage(),
    });
    expect(story.tone).toBe('Tragedy');
  });

  test('collectionName is preserved from spotlights (including null)', async () => {
    const noCollectionSpotlights: NftSpotlights = { ...NFT_SPOTLIGHTS, collectionName: null };
    const { story } = await renderNftStory(noCollectionSpotlights, 'Elegy', {
      chat: makeNftChat(),
      image: makeImage(),
    });
    expect(story.collectionName).toBeNull();
  });
});

describe('renderStory — cost-guard integration', () => {
  test('throws CostCapExceededError when daily cap is hit at entry', async () => {
    const guard = new CostGuard(1.0);
    guard.increment(1.0); // cap exhausted

    await expect(
      renderStory(SPOTLIGHTS, 'wallet', 'Epic', {
        chat: makeChat(),
        image: makeImage(),
        costGuard: guard,
      }),
    ).rejects.toThrow(CostCapExceededError);
  });

  test('increments the cost guard after a successful render', async () => {
    const guard = new CostGuard(10.0);
    expect(guard.spent).toBe(0);

    await renderStory(SPOTLIGHTS, 'wallet', 'Epic', {
      chat: makeChat(),
      image: makeImage(),
      costGuard: guard,
    });

    expect(guard.spent).toBeCloseTo(RENDER_COST_USDC, 6);
  });

  test('two renders accumulate spend in the shared guard', async () => {
    const guard = new CostGuard(10.0);

    for (let i = 0; i < 2; i++) {
      await renderStory(SPOTLIGHTS, 'wallet', 'Epic', {
        chat: makeChat(),
        image: makeImage(),
        costGuard: guard,
      });
    }

    expect(guard.spent).toBeCloseTo(RENDER_COST_USDC * 2, 6);
  });

  test('render aborts before calling chat/image when cap is already hit', async () => {
    const guard = new CostGuard(1.0);
    guard.increment(1.0);

    const chatCalls: ChatCompleteArgs<unknown>[] = [];
    const imageCalls: string[] = [];

    await expect(
      renderStory(SPOTLIGHTS, 'wallet', 'Epic', {
        chat: makeChat({ capture: chatCalls }),
        image: makeImage({ capture: imageCalls }),
        costGuard: guard,
      }),
    ).rejects.toThrow(CostCapExceededError);

    expect(chatCalls).toHaveLength(0);
    expect(imageCalls).toHaveLength(0);
  });
});
