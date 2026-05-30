/**
 * Verifies that WalletStoryRow.story accepts all 4 kind variants (wallet, tx, nft, token).
 * The widening in #79 lets any kind be stored in the same `wallet_stories` table row.
 */
import { describe, expect, test } from 'bun:test';
import type { WalletStoryRow } from '@/story-repo';
import type { NftStory, TokenStory, TxStory, WalletStory } from '@/story-renderer';

describe('WalletStoryRow.story kind union', () => {
  test('accepts a WalletStory', () => {
    const story: WalletStory = {
      kind: 'wallet',
      input: 'wallet1',
      tone: 'Epic',
      title: 'T',
      subtitle: 'S',
      stats: [],
      sections: [],
      verdict: 'v',
      heroImagePrompt: 'p',
      heroImageUrl: 'https://example.com/img.png',
    };
    const row: WalletStoryRow = {
      inputHash: 'h1',
      input: 'wallet1',
      story,
      provenance: 'seed',
      createdAt: new Date(),
    };
    expect(row.story.kind).toBe('wallet');
  });

  test('accepts a TxStory', () => {
    const story: TxStory = {
      kind: 'tx',
      input: 'sig1',
      tone: 'Forensic',
      title: 'T',
      subtitle: 'S',
      slot: 1,
      blockTime: null,
      feeLamports: 5000,
      computeUnitsConsumed: null,
      signerShort: 'AAAA…BBBB',
      programLabels: [],
      ixProgramIds: [],
      revertedInstructionIndices: [],
      balanceDeltas: [],
      serpSnippets: [],
      hinge: 'h',
      narrative: 'n',
      verdict: 'v',
      heroImagePrompt: 'p',
      heroImageUrl: 'https://example.com/img.png',
    };
    const row: WalletStoryRow = {
      inputHash: 'h2',
      input: 'sig1',
      story,
      provenance: 'seed',
      createdAt: new Date(),
    };
    expect(row.story.kind).toBe('tx');
  });

  test('accepts an NftStory — story.kind discriminator is accessible', () => {
    // NftStory uses storyImageUrl instead of heroImageUrl and has traits/provenance arrays.
    // We only verify the type-level discriminator at runtime here.
    const story = {
      kind: 'nft' as const,
      input: 'mint1',
      tone: 'Elegy' as const,
      title: 'T',
      subtitle: 'S',
      name: 'Cool NFT',
      collectionName: null,
      traits: [{ label: 'Background', value: 'Blue' }],
      provenance: [
        {
          short: 'minted',
          duration: '0d',
          acquired: 'mint' as const,
          note: 'first mint',
        },
      ],
      drama: 'some drama',
      storyImagePrompt: 'p',
      imageUri: 'https://example.com/onchain.png',
      storyImageUrl: 'https://example.com/img.png',
      verdict: 'v',
    } satisfies NftStory;
    const row: WalletStoryRow = {
      inputHash: 'h3',
      input: 'mint1',
      story,
      provenance: 'seed',
      createdAt: new Date(),
    };
    expect(row.story.kind).toBe('nft');
  });

  test('accepts a TokenStory — story.kind discriminator is accessible', () => {
    const story = {
      kind: 'token' as const,
      input: 'mint2',
      tone: 'Comedy' as const,
      title: 'T',
      subtitle: 'S',
      stats: [
        { label: 'Supply', value: '927B' },
        { label: 'Price', value: '$0.00003' },
        { label: 'Mint authority', value: 'renounced' },
      ],
      sections: [
        { title: 's1', body: 'b1' },
        { title: 's2', body: 'b2' },
        { title: 's3', body: 'b3' },
        { title: 's4', body: 'b4' },
        { title: 's5', body: 'b5' },
      ],
      verdict: 'v',
      heroImagePrompt: 'p',
      heroImageUrl: 'https://example.com/img.png',
      imageUri: 'https://example.com/onchain.png',
    } satisfies TokenStory;
    const row: WalletStoryRow = {
      inputHash: 'h4',
      input: 'mint2',
      story,
      provenance: 'seed',
      createdAt: new Date(),
    };
    expect(row.story.kind).toBe('token');
  });
});
