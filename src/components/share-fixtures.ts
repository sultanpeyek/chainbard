import bs58 from 'bs58';
import type { NftStory, TxStory, WalletStory } from '@/story-renderer';

// ── Tx fixture (no-API fallback) ─────────────────────────────────────────────

export const FIXTURE_TX_STORY: TxStory = {
  kind: 'tx',
  input: (() => {
    const bytes = new Uint8Array(64);
    for (let i = 0; i < 64; i++) bytes[i] = (i % 64) + 1;
    return bs58.encode(bytes);
  })(),
  tone: 'Forensic',
  title: 'The Forty-Seven Second Cascade',
  subtitle:
    'One transaction. Eight programs. Eighteen instructions. A vault touched, a market reset, a fortune redistributed.',
  slot: 298441209,
  blockTime: 1739239632,
  feeLamports: 4200,
  computeUnitsConsumed: 1180000,
  signerShort: 'GhE9…vKp2',
  programLabels: [
    { programId: 'MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD', name: 'Marginfi', calls: 2 },
    { programId: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', name: 'Jupiter', calls: 4 },
    { programId: '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP', name: 'Orca', calls: 3 },
    { programId: 'dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH', name: 'Drift', calls: 1 },
    { programId: 'KLend2g3cP87fffoy8q1mQqGKjrL1AyL9Fz2bkn57w', name: 'Kamino', calls: 2 },
    { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', name: 'Token', calls: 3 },
    { programId: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', name: 'Token2022', calls: 1 },
    { programId: 'ComputeBudget111111111111111111111111111111', name: 'ComputeBudget', calls: 2 },
  ],
  ixProgramIds: [
    'ComputeBudget111111111111111111111111111111',
    'ComputeBudget111111111111111111111111111111',
    'MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD',
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
    '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP',
    '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP',
    '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP',
    'dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH',
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
    'KLend2g3cP87fffoy8q1mQqGKjrL1AyL9Fz2bkn57w',
    'KLend2g3cP87fffoy8q1mQqGKjrL1AyL9Fz2bkn57w',
    'MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD',
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  ],
  revertedInstructionIndices: [9],
  balanceDeltas: [
    {
      pubkey: 'GhE9vKp2aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      preLamports: 12400000000,
      postLamports: 59600000000,
    },
    { pubkey: 'MarginfiLP111111111111111111111111111111111', preLamports: 0, postLamports: 180000 },
    {
      pubkey: 'OrcaPool11111111111111111111111111111111111',
      preLamports: 4200000000000,
      postLamports: 4187600000000,
    },
  ],
  serpSnippets: [
    'Jupiter is a key liquidity aggregator and swap infrastructure provider for Solana DeFi.',
    'Marginfi offers flash loans and lending on Solana, enabling complex DeFi strategies.',
    'Orca is a Solana DEX providing concentrated liquidity pools via the Whirlpool standard.',
  ],
  hinge:
    'Instruction 01 — setComputeUnitPrice at four micro-lamports above the median. That single parameter determined MEV priority. Without it, this transaction lost the race.',
  narrative:
    'Borrow → swap → arb → unwind. Flash loan from Marginfi opened a 1.8M USDC position. Jupiter routed through three Orca whirlpools in parallel, capturing a 47.2 SOL arbitrage. One Jupiter route at instruction 09 reverted on slippage breach; a retry at instruction 10 cleared through a different pool. The Drift short was unwound before repayment. Total elapsed: 47 seconds from confirmation to settlement.',
  verdict:
    'Not a hack. A ruthlessly priced piece of on-chain choreography. Three protocols paid the spread. One signer went home with 47 SOL.',
  heroImagePrompt:
    'Abstract digital circuit topology viewed from above at night, concentric rings of light pulses flowing outward from a central node, geometric tessellation in deep navy and amber, no human figures, no animals, pure machinery and light.',
  heroImageUrl: 'https://images.acedata.cloud/fixture-tx-hero.jpg',
};

export const FIXTURE_TX_SIG = FIXTURE_TX_STORY.input;

// ── Wallet fixture (no-API fallback) ─────────────────────────────────────────

export const FIXTURE_WALLET = 'B1aLAAe4vW8nSQCetXnYqJfRxzTjnbooasVZjUUtsKf';

export const FIXTURE_WALLET_STORY: WalletStory = {
  kind: 'wallet',
  input: FIXTURE_WALLET,
  tone: 'Epic',
  title: 'The Architect of Quiet Bridges',
  subtitle: 'A wallet that arrived in the silence of 2020 and never left.',
  stats: [
    { label: 'First seen', value: 'Mar 16, 2020' },
    { label: 'Txs sampled', value: '50' },
    { label: 'Balance', value: '1.23 SOL' },
    { label: 'Token accounts', value: '12' },
  ],
  sections: [
    {
      title: 'Origin',
      body: 'Funded by a single 2.4 SOL transfer from a now-defunct exchange hot wallet, this address opened its eyes during the Mainnet Beta dawn.',
    },
    {
      title: 'Companions',
      body: 'Three counterparties recur like leitmotifs: a multisig that built rails, a market-maker that whispered liquidity, and a solitary wallet that shows up only at inflection points.',
    },
    {
      title: 'Eras',
      body: 'The Quiet Year (2020). The Builder Spring (2021). The Long Winter (2022). The Reawakening (2023). The Architect (2024–now).',
    },
    {
      title: 'The Crowning',
      body: 'On a Tuesday in September 2024, this wallet executed a 47-instruction transaction that rebalanced a treasury, settled a vesting cliff, and tipped a developer 12 SOL — all in one breath.',
    },
    {
      title: 'The Drama',
      body: 'There was, once, a near-miss: a malicious program request, intercepted by what looks like a hardware-wallet refusal. The transaction failed at simulation.',
    },
  ],
  verdict:
    'This is a wallet that does not perform. It builds, it tends, it endures. If the chain has elders, this is one of them.',
  heroImagePrompt:
    'A vast desert at dawn, weathered stone bridges spanning silent canyons, ornamental geometric patterns as visual texture, no figures, cinematic.',
  heroImageUrl: 'https://placehold.co/1200x600/0b1d3a/c89b3c?text=hero',
};

// ── NFT fixture (no-API fallback) ────────────────────────────────────────────

export const NFT_FIXTURE_MINT = 'BzG3LcMaskBearer4267xKqPnRvSwTzAa9BCdEfGhJk';

export const NFT_FIXTURE: NftStory = {
  kind: 'nft',
  input: NFT_FIXTURE_MINT,
  tone: 'Elegy',
  name: 'Mask Bearer №4267',
  collectionName: 'Mask Bearers',
  title: 'The Mask That Outlived Its Drainer',
  subtitle: 'Minted in the bull. Sold in the bear. Stolen, recovered, held again.',
  traits: [
    { label: 'Mask', value: 'Crimson Hex' },
    { label: 'Robe', value: 'Indigo Wave' },
    { label: 'Background', value: 'Desert Dawn' },
    { label: 'Glyph', value: 'Triple Crescent (×52)' },
  ],
  provenance: [
    {
      short: 'Minter (0x000)',
      duration: '0 days',
      acquired: 'mint',
      note: 'Third drop wave · 4.2 SOL',
      price: '4.2 SOL',
    },
    {
      short: 'GhE9…vKp2',
      duration: '11 days',
      acquired: 'buy',
      note: 'First flip after mint',
      price: '6.8 SOL',
    },
    {
      short: 'mEv…3Lk',
      duration: '57 minutes',
      acquired: 'buy',
      note: 'Inside-the-hour flip',
      price: '8.1 SOL',
    },
    {
      short: 'Avatar.sol',
      duration: '14 months',
      acquired: 'buy',
      note: 'PFP shrine era · Twitter avatar for 14mo',
      price: '12 SOL',
    },
    {
      short: 'Sun…8Tz',
      duration: '23 minutes',
      acquired: 'buy',
      note: 'Sunday peak · Coinbase buyer',
      price: '142 SOL',
    },
    {
      short: 'drainer-flagged',
      duration: '8 hours',
      acquired: 'transfer',
      note: 'Theft · flagged on three drainer lists',
    },
    {
      short: 'Solanart escrow',
      duration: '9 days',
      acquired: 'recovery',
      note: 'Recovery thread → escrow return',
    },
    {
      short: 'Avatar.sol',
      duration: '6 months',
      acquired: 'buy',
      note: 'Bought back · PFP reclaimed',
      price: '38 SOL',
    },
    {
      short: '??? (anonymous)',
      duration: '3 weeks',
      acquired: 'buy',
      note: 'Anonymous · current holder',
      price: '24 SOL',
    },
  ],
  drama:
    'October 12th: this mint moved to a wallet that appeared on three independent drainer lists within six hours. The original holder noticed. Recovery began. Nine days later, through a marketplace escrow mechanism, the NFT returned. The drainer wallet has not moved since — 847 SOL frozen, a monument to one failure.',
  storyImagePrompt:
    'Ancient desert ruins at dusk, geometric mask-shaped shadows carved in stone, triple-crescent motif in ornamental script, amber and crimson light, no living beings, no faces, pure geometry and landscape.',
  imageUri: 'https://placehold.co/600x600/2b1810/d4a574?text=Mask+Bearer',
  storyImageUrl: 'https://placehold.co/1200x600/2b1810/f4ecd6?text=NFT+saga',
  verdict:
    'Not the rarest in the set, not the most expensive — but held, lost, recovered, and held again: rarer than rarity.',
};
