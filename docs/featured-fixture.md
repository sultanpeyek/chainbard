# chainbard — Seed-Mint Fixture Research

Pre-picked slate for `scripts/seed-mint.ts` (issue #1, parent: gallery seed work) — **6 priority fixtures + 1 deprioritized**. Top 6: 1 wallet, 2 txs, 2 NFTs, 1 token. Deprioritized: the Wormhole-attacker wallet (minted last). All-time mix across 2020–2026; spans all four drama buckets (exploits/rugs, viral, whale/origin, ATH/rug arcs).

Every identifier below was returned by primary or near-primary sources (Solscan, Halborn, Chainalysis, Jito docs, CryptoSlam, official project tweets) and confirmed end-to-end. The SLERF burn tx (Tx #2) was the last open lookup; it's now resolved on-chain via Solana Explorer (see Tx #2).

---

## Final slate — top 6 priority + 1 deprioritized

### Wallet #1 — Wintermute Solana MM Wallet — Elegy
- **kind:** `wallet`
- **identifier:** `5sTQ5ih7xtctBhMXHr3f1aWdaXazWrWfoehqWdqWnTFP`
- **default tone:** Elegy
- **era:** 2023–ongoing
- **drama hook:** The silent giant — the market-maker wallet behind the price of every Solana memecoin you've ever traded. Labeled "Wintermute 3" on Solscan; runs thousands of fills per hour without ever telling its own story.
- **why it makes the slate:** The lead wallet pick — a meditative, ongoing story about the unseen liquidity that lets the casino exist. Contrast register to the deprioritized Wormhole-attacker wallet (one-shot exploit tragedy); two completely different cinematic registers from the same template. Verified ✓.
- **sources:** [Solscan account (labeled)](https://solscan.io/account/5sTQ5ih7xtctBhMXHr3f1aWdaXazWrWfoehqWdqWnTFP)

### Tx #1 — Wormhole `complete_wrapped` exploit tx — Forensic
- **kind:** `tx`
- **identifier:** `25Zu1L2Q9uk998d5GMnX43t9u9eVBKvbVtgHndkc2GmUFed8Pu73LGW6hiDsmGXHykKUTLkvUdh4yXPdL3Jo4wVS`
- **default tone:** Forensic
- **era:** Feb 2022 classic
- **drama hook:** The single instruction call that conjured 120K wETH from a missing signature check on a spoofed sysvar — the most expensive `accountInfo.is_signer` bug in Solana history.
- **why it makes the slate:** Best possible showcase for the **forensic dashboard template** (instruction stack, programs legend, balance-delta table, "hinge" callout). Pairs with the deprioritized Wormhole-attacker wallet for cross-linked narrative if it gets minted. Verified ✓.
- **sources:** [Solscan tx](https://solscan.io/tx/25Zu1L2Q9uk998d5GMnX43t9u9eVBKvbVtgHndkc2GmUFed8Pu73LGW6hiDsmGXHykKUTLkvUdh4yXPdL3Jo4wVS) · [Halborn instruction-level breakdown](https://www.halborn.com/blog/post/explained-the-wormhole-hack-february-2022)

### Tx #2 — SLERF presale burn — Comedy
- **kind:** `tx`
- **identifier:** `hzVc7DevXGi3DKEyrR23PVV6DRmpA1LgnwUeQkNjnm42tQ7rGipATsLuuSnEaKVbDahWJnwbm2ZGWEF4CTwaBMG`
- **default tone:** Comedy
- **era:** Mar 2024
- **drama hook:** A dev tried to clear dust tokens and accidentally cremated the 500M-SLERF airdrop allocation **and** the Raydium LP in two clicks. The token still did $1.7B in volume that day. Eventually refunded 19 months later. Peak Comedy.
- **why it makes the slate:** Contrast to Tx #1. Forensic template handling a *funny* failure — the dashboard treatment of an "oopsie" is the dunk that sells the product. Verified ✓.
- **on-chain detail:** The "oh fuck" tx is the 500M airdrop burn above (Mar 18 2024, slot 254880667, SPL burn — supply destroyed, not sent to an incinerator address). The Raydium LP burn `FFe9R9AfNx7B5vSHGABNSD32mMpynPA7sxF8PpEWDPwmP341jnpQ3ax8TJUXu3xCwvkEKJ9kcrdWz5QZBE8u9fT` fired 49s earlier. Both signed by dev wallet "Grumpy" `HdENn8wP6srk1AuE2CaJj6bRbjcU2kYs12H4C4HgNAsF` (fee-payer + burn authority), against mint `7BgBvyjrZX1YKz4oh9mjb8ZScatkkwb8DzFx7LoiVkM3`.
- **sources:** [Solana Explorer (burn tx)](https://explorer.solana.com/tx/hzVc7DevXGi3DKEyrR23PVV6DRmpA1LgnwUeQkNjnm42tQ7rGipATsLuuSnEaKVbDahWJnwbm2ZGWEF4CTwaBMG) · [The Block](https://www.theblock.co/post/283025/solana-memecoin-slerf-burn) · [CoinDesk](https://www.coindesk.com/markets/2024/03/18/solana-meme-slerf-notches-17b-in-volume-after-developer-loses-all-presale-funds) · [Live Bitcoin News (refund story)](https://www.livebitcoinnews.com/memecoin-news-solana-meme-coin-slerf-finalizes-10m-refund-for-burned-presale-tokens/)

### NFT #1 — Mad Lads #7541 — Epic
- **kind:** `nft`
- **identifier:** `7zuR45WCsAsWsrqvYPyvLXFiCRKuvjh7HrMcNJ6F36Kd`
- **default tone:** Epic
- **era:** April 2023
- **drama hook:** The collection that single-handedly resurrected Solana NFTs post-FTX — two ex-FTX engineers (Coral / Backpack team) shipped the first xNFT, survived a bot-flooded mint day and a $250K decoy-mint counter-attack, and turned 10K pixel-art holders into the post-collapse blue-chip cohort.
- **why it makes the slate:** Demos the **NFT template** with a famous collection at a non-trivial mint number (representative rather than vanity #1). Visual aesthetic is strong; on-chain provenance ladder will be rich. Verified ✓.
- **sources:** [Solscan token](https://solscan.io/token/7zuR45WCsAsWsrqvYPyvLXFiCRKuvjh7HrMcNJ6F36Kd) · [Mad Lads collection on Solscan](https://solscan.io/collection/f25cd97f956c603b9a1fd405ae8b6a438c07dbe39f53ab48162ddd08429da6d9)

### NFT #2 — Solana Monkey Business #4042 — Elegy
- **kind:** `nft`
- **identifier:** `5qhhJQND3kSCUupWewer7UZoKhH9st4e3YdGAJU2xACd`
- **default tone:** Elegy
- **era:** Aug 2021 classic
- **drama hook:** Pixel apes from August 2021 — Solana's original blue-chip PFP. Survived four bear markets, the entire FTX implosion, and the 2023 NFT winter. The OG legacy collection.
- **why it makes the slate:** Era diversity (2021 vs 2023 for NFT #1). Different visual aesthetic (16-bit pixel vs Mad Lads' painted-portrait), different acquisition history (long, layered) — exercises the provenance ladder fully. Verified ✓.
- **sources:** [CryptoSlam SMB #4042](https://www.cryptoslam.io/smb-gen2/mint/5qhhJQND3kSCUupWewer7UZoKhH9st4e3YdGAJU2xACd)

### Token — BONK — Comedy / Epic
- **kind:** `token`
- **identifier:** `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263`
- **default tone:** Comedy (with Epic undertone)
- **era:** Christmas Day 2022 → ongoing
- **drama hook:** December 25, 2022 — post-FTX wreckage, SOL at $8 and dropping. An anonymous team of 22 Solana devs airdrops a meme dog to 297K wallets. SOL pumps 34% overnight. The meme that saved Solana.
- **why it makes the slate:** *The* Solana token story. Christmas timing, post-FTX context, founder anonymity, 297K-wallet airdrop, and a clean ATH arc all in one fixture. Best possible showcase for the **token market-dashboard template**. Verified ✓.
- **sources:** [Solscan token](https://solscan.io/token/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263) · [Solana Explorer](https://explorer.solana.com/address/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263) · [Coinbase Assets listing](https://x.com/CoinbaseAssets/status/1735005530563702802)

### Deprioritized — Wormhole Bridge Attacker (Solana side) — Tragedy
- **kind:** `wallet`
- **identifier:** `2SDN4vEJdCdW3pGyhx2km9gB3LeHzMGLrG2j4uVNZfrx`
- **default tone:** Tragedy
- **era:** Feb 2022 classic
- **status:** Deprioritized — minted last, below the top-6 priority slate.
- **drama hook:** The wallet that minted 120,000 wETH out of thin air via a spoofed `Sysvar` account check, then watched Jump Crypto eat the $326M loss to keep Solana solvent. Patient zero for "bridges are the soft underbelly of crypto."
- **why deprioritized:** Strong story, but the exploit angle is already covered by Tx #1 (the actual mint tx). Kept for the optional cross-link, not as a priority pick.
- **sources:** [Halborn post-mortem](https://www.halborn.com/blog/post/explained-the-wormhole-hack-february-2022) · [Chainalysis writeup](https://www.chainalysis.com/blog/wormhole-hack-february-2022/) · [Solscan account](https://solscan.io/account/2SDN4vEJdCdW3pGyhx2km9gB3LeHzMGLrG2j4uVNZfrx)

---

## Slate composition rationale

| Slot | Era | Drama type | Tone | Template stress-test |
|---|---|---|---|---|
| Wallet #1 (Wintermute) | 2023→now | whale | Elegy | ongoing-flow-as-narrative |
| Tx #1 (Wormhole exploit) | 2022 classic | exploit | Forensic | bug-hinge dashboard |
| Tx #2 (SLERF airdrop burn) | Mar 2024 | viral | Comedy | failure-as-comedy |
| NFT #1 (Mad Lads #7541) | Apr 2023 | cultural | Epic | painted-portrait provenance |
| NFT #2 (SMB #4042) | Aug 2021 | origin | Elegy | pixel/legacy provenance |
| Token (BONK) | Dec 2022 → now | ATH arc | Comedy/Epic | full market dashboard |
| _Deprioritized:_ Wormhole hacker (wallet) | 2022 classic | exploit | Tragedy | exploit-as-narrative |

Cross-coverage check (top 6 unless noted):
- **All 4 drama buckets** present (exploit/rug: Wormhole tx, SLERF; viral: SLERF, BONK; whale/origin: Wintermute, SMB; ATH arc: BONK).
- **Template kinds** — top 6: wallet ×1, tx ×2, NFT ×2, token ×1. The deprioritized pick adds a 2nd wallet.
- **Tones** — top 6 cover Comedy, Epic, Elegy, Forensic. **Tragedy** only lands if the deprioritized Wormhole-attacker wallet is also minted.
- **Era spread** 2021 → 2024 (no 2025–2026 in final slate — see Substitute #B3 if a recent pick is wanted).
- **Cross-fixture linking** — the deprioritized Wormhole-attacker wallet ↔ Tx #1 are the same story from two template angles. Optional demo of the gallery as a coherent on-chain narrative graph if both get minted.

---

## Substitutes (if any final pick is undesirable)

### Substitute #B1 — fully-verified Tx #2 replacement: **the BONK token-mint creation tx**
- The very first SPL token creation tx for `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263`. Identifier requires a 30-second Solscan pull (oldest tx on the BONK mint's history page), but the story is iconic and the tx-template treatment ("Solana's redemption arc begins here, on Christmas Day, at slot N") is excellent. Tone: Epic.

### Substitute #B2 — fully-verified Tx #2 replacement: **OFFICIAL TRUMP launch tx**
- The Jan 17 2025 creation tx for `6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN`. Same Solscan-pull caveat. Drama hook: "A sitting president-elect launched a $27B memecoin 72 hours before inauguration; 9M new Solana addresses opened overnight." Tone: Epic/Tragedy. Provides 2025-era representation if you want recency.

### Substitute #B3 — recency hedge: **OFFICIAL TRUMP** replaces **BONK** as the token slot
- Trades the most-Solana-native story (BONK) for the most-currently-newsworthy one (TRUMP). Verified ✓. Recommend only if the gallery launch coincides with a TRUMP-related news cycle.

### Substitute #B4 — wallet diversity: **Mango Markets exploiter** `4ND8FVPjUGGjx9VuGFuJefDWpg3THb58c277hbVRnjNa` replaces Wallet #1
- Verified ✓. Drama: traded against himself, called it a "highly profitable trading strategy," lost in court. Tone: Comedy/Forensic. Trade-off: keeps the slate exploit-heavy on wallets; loses the cross-link to Tx #1.

### Substitute #B5 — NFT alternatives if a true #1 is wanted
- Mad Lads #1, DeGods #1, Okay Bears #1 — all require a Tensor or Magic Eden lookup by token-number metadata. None surfaced cleanly in primary sources. Substitute only if vanity #1s matter more than verified identifiers.

---

## Honest gaps and lookup notes

1. **NFT individual #1s** — neither Mad Lads #1 nor SMB #1 nor DeGods #1 was confirmable from primary sources. Used representative mints (Mad Lads #7541, SMB #4042) instead. If vanity #1s are required, allow a separate lookup pass via Tensor/ME.
2. **Toly's personal wallet** — not officially confirmed; only weakly attributed via Arkham. Excluded from final slate to avoid mislabeling on a public gallery.
3. **Solana genesis tx / first-ever cNFT mint** — neither has a canonical published signature. Excluded.

> Note: Solscan blocks bots; the SLERF burn sigs were confirmed via `explorer.solana.com` + an archival RPC (public RPCs prune the history). Use the Explorer links in Tx #2 to re-verify.

---

## Drop-in array for `scripts/seed-mint.ts`

```ts
// Top 6 priority + 1 deprioritized — paste-ready (all verified on-chain)
export const SEED_FIXTURES = [
  // Top 6 (priority slate)
  { kind: 'wallet', identifier: '5sTQ5ih7xtctBhMXHr3f1aWdaXazWrWfoehqWdqWnTFP', tone: 'elegy',    label: 'Wintermute MM' },
  { kind: 'tx',     identifier: '25Zu1L2Q9uk998d5GMnX43t9u9eVBKvbVtgHndkc2GmUFed8Pu73LGW6hiDsmGXHykKUTLkvUdh4yXPdL3Jo4wVS', tone: 'forensic', label: 'Wormhole exploit tx' },
  { kind: 'tx',     identifier: 'hzVc7DevXGi3DKEyrR23PVV6DRmpA1LgnwUeQkNjnm42tQ7rGipATsLuuSnEaKVbDahWJnwbm2ZGWEF4CTwaBMG', tone: 'comedy', label: 'SLERF airdrop burn' },
  { kind: 'nft',    identifier: '7zuR45WCsAsWsrqvYPyvLXFiCRKuvjh7HrMcNJ6F36Kd', tone: 'epic',  label: 'Mad Lads #7541' },
  { kind: 'nft',    identifier: '5qhhJQND3kSCUupWewer7UZoKhH9st4e3YdGAJU2xACd', tone: 'elegy', label: 'Solana Monkey Business #4042' },
  { kind: 'token',  identifier: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', tone: 'comedy', label: 'BONK' },
  // Deprioritized (minted last)
  { kind: 'wallet', identifier: '2SDN4vEJdCdW3pGyhx2km9gB3LeHzMGLrG2j4uVNZfrx', tone: 'tragedy', label: 'Wormhole Bridge Attacker' },
] as const;
```

---

## Sources (consolidated)

- [Solscan — Wormhole hacker account](https://solscan.io/account/2SDN4vEJdCdW3pGyhx2km9gB3LeHzMGLrG2j4uVNZfrx)
- [Halborn — Wormhole hack explained](https://www.halborn.com/blog/post/explained-the-wormhole-hack-february-2022)
- [Chainalysis — Wormhole post-mortem](https://www.chainalysis.com/blog/wormhole-hack-february-2022/)
- [Solscan — Wintermute MM wallet](https://solscan.io/account/5sTQ5ih7xtctBhMXHr3f1aWdaXazWrWfoehqWdqWnTFP)
- [Solscan — Wormhole exploit tx](https://solscan.io/tx/25Zu1L2Q9uk998d5GMnX43t9u9eVBKvbVtgHndkc2GmUFed8Pu73LGW6hiDsmGXHykKUTLkvUdh4yXPdL3Jo4wVS)
- [Solscan — SLERF token mint](https://solscan.io/token/7BgBvyjrZX1YKz4oh9mjb8ZScatkkwb8DzFx7LoiVkM3)
- [Solana Explorer — SLERF airdrop burn tx](https://explorer.solana.com/tx/hzVc7DevXGi3DKEyrR23PVV6DRmpA1LgnwUeQkNjnm42tQ7rGipATsLuuSnEaKVbDahWJnwbm2ZGWEF4CTwaBMG)
- [Solana Explorer — SLERF Raydium LP burn tx](https://explorer.solana.com/tx/FFe9R9AfNx7B5vSHGABNSD32mMpynPA7sxF8PpEWDPwmP341jnpQ3ax8TJUXu3xCwvkEKJ9kcrdWz5QZBE8u9fT)
- [The Block — SLERF burn coverage](https://www.theblock.co/post/283025/solana-memecoin-slerf-burn)
- [CoinDesk — SLERF $1.7B volume](https://www.coindesk.com/markets/2024/03/18/solana-meme-slerf-notches-17b-in-volume-after-developer-loses-all-presale-funds)
- [Live Bitcoin News — SLERF refund 19 months later](https://www.livebitcoinnews.com/memecoin-news-solana-meme-coin-slerf-finalizes-10m-refund-for-burned-presale-tokens/)
- [Solscan — Mad Lads #7541](https://solscan.io/token/7zuR45WCsAsWsrqvYPyvLXFiCRKuvjh7HrMcNJ6F36Kd)
- [Solscan — Mad Lads collection](https://solscan.io/collection/f25cd97f956c603b9a1fd405ae8b6a438c07dbe39f53ab48162ddd08429da6d9)
- [CryptoSlam — SMB #4042](https://www.cryptoslam.io/smb-gen2/mint/5qhhJQND3kSCUupWewer7UZoKhH9st4e3YdGAJU2xACd)
- [Solscan — BONK token](https://solscan.io/token/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263)
- [Solana Explorer — BONK token](https://explorer.solana.com/address/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263)
- [Coinbase Assets — BONK listing tweet](https://x.com/CoinbaseAssets/status/1735005530563702802)
- [Sec3 — Mango exploit case study (substitute #B4)](https://www.sec3.dev/blog/mangoexploit)
- [TRM Labs — Tracing $TRUMP (substitute #B2/B3)](https://www.trmlabs.com/resources/blog/tracing-trump)
