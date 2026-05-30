/**
 * Fixture catalog — the single source of truth for chainbard's curated mainnet
 * assets. Each entry is written here exactly once; the seed-mint slate
 * (`scripts/seed-mint.ts`) and the homepage Featured strip (`src/config/featured.ts`)
 * are both **derived ordered views** over this catalog, so their identifiers,
 * labels, kinds, and tones can never drift apart.
 *
 * Light by design: pure data + types, no runtime imports. Safe to pull into the
 * browser bundle (Featured strip) and into the Node seed script alike.
 *
 * Entries are keyed by a short stable slug so the views reference an asset by
 * name instead of re-typing its base58 identifier.
 */

export type FixtureKind = 'wallet' | 'tx' | 'nft' | 'token';
export type FixtureTone = 'tragedy' | 'comedy' | 'epic' | 'elegy' | 'forensic';

export interface Fixture {
  /** Real MAINNET identifier (account / signature / mint). */
  readonly identifier: string;
  readonly kind: FixtureKind;
  /** Operator-curated display name (e.g. "Mad Lads #7541"). */
  readonly label: string;
  /** Default narrative tone used when seed-minting this asset. */
  readonly tone: FixtureTone;
  /**
   * Operator-curated "direction" narrative — the predefined brief supplied to
   * the Director to steer voice/angle/emphasis (never facts). Sourced from the
   * fixture's drama hook + why-it-makes-the-slate notes in
   * `docs/featured-fixture.md`.
   */
  readonly brief?: string;
}

export const FIXTURES = {
  wintermute: {
    identifier: '5sTQ5ih7xtctBhMXHr3f1aWdaXazWrWfoehqWdqWnTFP',
    kind: 'wallet',
    label: 'Wintermute MM',
    tone: 'elegy',
    brief:
      'The silent giant — the market-maker wallet behind the price of every Solana memecoin you\'ve ever traded. Labeled "Wintermute 3" on Solscan; runs thousands of fills per hour without ever telling its own story. The lead wallet pick — a meditative, ongoing story about the unseen liquidity that lets the casino exist. Contrast register to the deprioritized Wormhole-attacker wallet (one-shot exploit tragedy); two completely different cinematic registers from the same template. Verified ✓.',
  },
  wormholeTx: {
    identifier:
      '25Zu1L2Q9uk998d5GMnX43t9u9eVBKvbVtgHndkc2GmUFed8Pu73LGW6hiDsmGXHykKUTLkvUdh4yXPdL3Jo4wVS',
    kind: 'tx',
    label: 'Wormhole exploit tx',
    tone: 'forensic',
    brief:
      'The single instruction call that conjured 120K wETH from a missing signature check on a spoofed sysvar — the most expensive `accountInfo.is_signer` bug in Solana history. Best possible showcase for the forensic dashboard template (instruction stack, programs legend, balance-delta table, "hinge" callout). Pairs with the deprioritized Wormhole-attacker wallet for cross-linked narrative if it gets minted. Verified ✓.',
  },
  slerfBurn: {
    identifier:
      'hzVc7DevXGi3DKEyrR23PVV6DRmpA1LgnwUeQkNjnm42tQ7rGipATsLuuSnEaKVbDahWJnwbm2ZGWEF4CTwaBMG',
    kind: 'tx',
    label: 'SLERF airdrop burn',
    tone: 'comedy',
    brief:
      'A dev tried to clear dust tokens and accidentally cremated the 500M-SLERF airdrop allocation and the Raydium LP in two clicks. The token still did $1.7B in volume that day. Eventually refunded 19 months later. Peak Comedy. Contrast to the Wormhole exploit tx — the forensic template handling a funny failure; the dashboard treatment of an "oopsie" is the dunk that sells the product. Verified ✓.',
  },
  madLads: {
    identifier: '7zuR45WCsAsWsrqvYPyvLXFiCRKuvjh7HrMcNJ6F36Kd',
    kind: 'nft',
    label: 'Mad Lads #7541',
    tone: 'epic',
    brief:
      'The collection that single-handedly resurrected Solana NFTs post-FTX — two ex-FTX engineers (Coral / Backpack team) shipped the first xNFT, survived a bot-flooded mint day and a $250K decoy-mint counter-attack, and turned 10K pixel-art holders into the post-collapse blue-chip cohort. Demos the NFT template with a famous collection at a non-trivial mint number (representative rather than vanity #1). Visual aesthetic is strong; on-chain provenance ladder will be rich. Verified ✓.',
  },
  solanaMonkeyBusiness: {
    identifier: '5qhhJQND3kSCUupWewer7UZoKhH9st4e3YdGAJU2xACd',
    kind: 'nft',
    label: 'Solana Monkey Business #4042',
    tone: 'elegy',
    brief:
      "Pixel apes from August 2021 — Solana's original blue-chip PFP. Survived four bear markets, the entire FTX implosion, and the 2023 NFT winter. The OG legacy collection. Era diversity (2021 vs 2023 for Mad Lads). Different visual aesthetic (16-bit pixel vs Mad Lads' painted-portrait), different acquisition history (long, layered) — exercises the provenance ladder fully. Verified ✓.",
  },
  bonk: {
    identifier: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    kind: 'token',
    label: 'BONK',
    tone: 'comedy',
    brief:
      'December 25, 2022 — post-FTX wreckage, SOL at $8 and dropping. An anonymous team of 22 Solana devs airdrops a meme dog to 297K wallets. SOL pumps 34% overnight. The meme that saved Solana. The Solana token story: Christmas timing, post-FTX context, founder anonymity, 297K-wallet airdrop, and a clean ATH arc all in one fixture. Best possible showcase for the token market-dashboard template. Verified ✓.',
  },
  wormholeWallet: {
    identifier: '2SDN4vEJdCdW3pGyhx2km9gB3LeHzMGLrG2j4uVNZfrx',
    kind: 'wallet',
    label: 'Wormhole Bridge Attacker',
    tone: 'tragedy',
    brief:
      'The wallet that minted 120,000 wETH out of thin air via a spoofed Sysvar account check, then watched Jump Crypto eat the $326M loss to keep Solana solvent. Patient zero for "bridges are the soft underbelly of crypto." Strong story, but the exploit angle is already covered by the Wormhole exploit tx (the actual mint tx) — kept for the optional cross-link, not as a priority pick.',
  },
} as const satisfies Record<string, Fixture>;

export type FixtureSlug = keyof typeof FIXTURES;
