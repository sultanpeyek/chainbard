# Storyteller share-page prototype — NOTES

**Question (v1, answered):** which layout for the share page?
**Verdict:** C (cinematic). Confirmed via wallet variant comparison.

**Question (v2, open):** what should each kind's page actually look like, given that "one template, four kinds" is boring?
Hypothesis: kind == content shape. Wallet wants narrative. Tx wants forensic data. NFT wants asset + provenance. Token wants market dashboard. All four share *voice* (story tone), not *layout*.

**Run:** `bun run dev` → bottom bar switches between 4 kinds.

- wallet (Epic, cinematic narrative): http://localhost:3000/story-prototype/B1aLAAe4vW8nSQCetXnYqJfRxzTjnbooasVZjUUtsKf
- tx (Forensic, dashboard): http://localhost:3000/story-prototype/5j7sN8pQwR3vYxZ2kLmH4nT6bA9cFgJpQwR8vYxZ2kLmH4nT6bA9cFgJpQwR8vYxZ2kLmH4nT6bA
- NFT (Elegy, asset + provenance): http://localhost:3000/story-prototype/BzG3LcMaskBearer4267xKqPnRvSwTzAa9BCdEfGhJk
- token (Comedy, market dashboard): http://localhost:3000/story-prototype/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263

**Templates summary**
- **wallet** — cinematic full-bleed hero → 5 numbered story sections → verdict. Carried over from v1 winning variant C. Lyrical voice, image-led.
- **tx** — forensic dashboard. Block context chips, fee/CU meters, programs legend, instruction stack with reverted-ix highlighting, balance-delta table, "hinge" callout, short narrative, verdict. Data-first; story compresses to one paragraph + hinge box.
- **NFT** — asset showcase. Two-column hero: synthetic NFT art card (no faces, geometric) + traits/rarity. Vertical "Nine Hands" provenance ladder with color-coded acquisition (mint/buy/transfer/recovery). Drama as blockquote. Verdict.
- **token** — market dashboard. Big SVG price arc with ATH marker, market meters, horizontal-bar holder distribution, supply state ribbon (circulating/burned/locked), 5-card milestone strip, community + verdict.

**What's shared across all 4**
- Sticky `solana://` input bar (dark on tx/wallet/token, light on NFT)
- Bottom preset switcher (the 4 kinds)
- Prototype ribbon top-left
- Tone chip + kind chip in header
- "Mint your own — 0.30 USDC" CTA in share row

**What's *not* shared (deliberately)**
- Section count — wallet has 5+verdict, tx has narrative+hinge+verdict (no enumerated sections), NFT has provenance + drama, token has milestones + community.
- Section labels — each kind named for its content shape.
- Palette — wallet navy/gold, tx purple/rose, NFT sepia, token amber.
- Light/dark — NFT is light (museum), others dark (cinematic/forensic/market).

**Test next**
- Compare side-by-side mobile screenshots — does each "feel" like the thing it represents?
- Boring-input stress: replace mocks with thin-story fixtures. Tx with 2 ixs. NFT with 1 holder. Token with no ATH. Which template breaks first?
- Cross-kind tweetability — would you tweet each variant raw? Tx dashboard might need a "summary hero card" for OG-unfurl.
- Tx specifically: is the instruction stack the right grain, or should it collapse program-by-program with expandables?

**Verdict (v2):** _TODO — fill in after live review_
- Per-kind template lands? (Y/N each)
- Anything to steal across kinds?
- Carry to production: which template needs the most polish before ship?
