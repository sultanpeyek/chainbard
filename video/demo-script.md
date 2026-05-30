# ChainBard — Demo Recording Script

> Guide for screen-recording the live product yourself (ScreenStudio or similar).
> **One recording → two cuts.** SHORT (steps 1–4) for X/Twitter. LONG (steps 1–5) for judges.
> Record the **browser only** on **prod: `chainbard.vercel.app`**. No CLI, no terminal.

**On-camera subject:** BONK token mint → `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263`

---

## Before you record (pre-flight)

- [ ] **Dry-run the BONK render OFF-camera first.** Minting BONK settles 0.30 USDC and re-renders every time (no short-circuit / cache bypass). This flips BONK's featured card to `provenance='buyer'` — that is fine and desirable. Do a full silent rehearsal so you know the timing and nothing surprises you on the real take.
- [ ] **Wallet funded:** ≥ 0.30 USDC for the mint **plus** a little SOL for network fees.
- [ ] **Phantom installed, unlocked, and on the right account** before you hit record.
- [ ] **Clean browser:** hide the bookmarks bar, hide/disable extension icons, turn off OS + browser notifications (Do Not Disturb), no other tabs open.
- [ ] **Resolution:** record at **1920×1080** (or a Retina display downscaling cleanly to 1080p).
- [ ] **Steady cursor.** Move deliberately, pause on clicks, no jitter. Let each screen settle before acting.
- [ ] **Single continuous take** if you can — you'll trim to two cuts in post.
- [ ] Browser zoom at 100%. Window maximized.

---

## Captions & overlays — styling (match the brand)

X autoplays **muted**, so the **on-screen captions must carry the whole story by themselves**. Add them in post as overlays.

| Element | Font | Color |
|---|---|---|
| Narrative caption lines | **Fraunces** (display serif) | bone text `#ece4d6` on ink ground `#0b0a09` |
| Addresses / identifiers / amounts | **IBM Plex Mono** | bone `#ece4d6`, key token in amber `#e8a13a` |
| Single accent (one key word, link, or moment) | either | amber `#e8a13a` |

- Ground every overlay panel on **ink `#0b0a09`** (warm near-black — never pure `#000`).
- Use amber **sparingly** — one accent per beat, not a highlighter.
- Motion: slow fade / settle in. Nothing springy, no bounce.
- Lower-third placement; keep captions clear of Phantom's popup.

---

## The 5-step spine

### Step 1 — Hook (~15s)

| | |
|---|---|
| **On screen** | Land on home hero: *"Every address holds a story. Render it."* Paste the BONK mint into the input. Click **Preview**. The free preview shows detected **kind = token** and on-chain facts. **No spend.** |
| **Caption** | `Every address holds a story.` → then over the paste: `Paste any Solana address.` → over the preview result: `Free preview — it already knows what this is.` |
| **Identifier overlay (Plex Mono)** | `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263`  ·  tag `token` in amber |
| **Voiceover (optional)** | "Every address on Solana holds a story. Paste one — ChainBard reads the chain for free and tells you exactly what it's looking at." |

### Step 2 — Pay (~20s)

| | |
|---|---|
| **On screen** | (Optional) type a short **patron's brief** in the free-text field to steer the voice — there is **no tone dropdown**. Click **Connect** → Phantom. Click **Mint · 0.30 USDC**. Approve in the Phantom popup. |
| **Caption** | `Add a brief to steer the telling.` → `Connect. Mint for 0.30 USDC.` → over the approval: `Approve in your wallet.` |
| **Identifier overlay (Plex Mono)** | `Mint · 0.30 USDC` (amount in amber) |
| **Voiceover (optional)** | "Leave a brief if you want to steer the voice. Connect Phantom, and mint for thirty cents." |

> **Brief idea (optional, on-brand):** *"Tell it like a frontier ballad — the meme that saved Solana."*

### Step 3 — Settle (~10s)

| | |
|---|---|
| **On screen** | The **MintConsole** streams labeled steps in order. Let it run; don't speed past it — the labels are the proof. |
| **Caption beats (use the real step labels, in order)** | `Building payment` → `Dry-running` → `Awaiting signature` → `Verifying payment` → `Settling on-chain` → `Confirming` → `Reading the brief` → `Gathering facts` → `Searching the web` → `Writing your story` → `Generating image` → `Saving` → `Stamping receipt` |
| **Caption (overlay summary line)** | `It works while you watch.` |
| **Voiceover (optional)** | "It settles the payment on-chain, reads the facts, searches the web, and writes — start to finish, on its own." |

> Pace the captions to the actual stream; let a few key labels (`Settling on-chain`, `Writing your story`, `Stamping receipt`) hold a beat longer.

### Step 4 — Payoff (~20s)  ·  **SHORT cut ends here**

| | |
|---|---|
| **On screen** | Redirect to the story page at `/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263`. Show the **hero image**, scroll the **narrative**, land on the **provenance wax-seal**. |
| **Caption** | `Your story, rendered.` → on scroll: `A hero image. A narrative. A sealed provenance.` → `A shareable page at its own URL.` |
| **Identifier overlay (Plex Mono)** | `chainbard.vercel.app/DezXAZ…PB263` |
| **Voiceover (optional)** | "And here it is — a hero image, a written narrative, a sealed provenance. A shareable page at its own URL." |

> **⟶ CUT POINT for the SHORT (X/Twitter) version: end the clip here, on the wax-seal.** End card optional: wordmark "chain" (bone) + "bard" (amber) on ink, with `chainbard.vercel.app`.

### Step 5 — Proof tail (~15s)  ·  **LONG cut only (judges)**

| | |
|---|---|
| **On screen** | Open `/activity` — show the on-chain receipts feed. Then open `/judge` — show the live **402** response. |
| **Caption** | `Every render leaves a receipt.` → on /judge: `Paid on-chain, live — a real 402.` |
| **Voiceover (optional)** | "Every render leaves an on-chain receipt — and it pays for itself, autonomously, with a live 402." |

> **⟶ This is the LONG (judge) cut: keep through Step 5.** The autonomy / x402 / paid-on-chain angle rides **only here, as a one-line kicker** — never the lead.

---

## Do / Don't

| ✅ Do | ❌ Don't |
|---|---|
| Lead with **utility + curiosity** ("it already knows what this is"). | Don't lead with autonomy / x402 — keep it to the one-line kicker in Step 5. |
| Say **"a shareable page at its own URL."** | **Never** say "permanent." |
| Keep copy **literary, mythic, restrained.** | No "revolutionary / game-changing / to-the-moon / GM / wagmi / degen," no rocket emoji. |
| One amber accent per beat. | Don't flood with amber or recolor the feather mark. |
| Let screens settle; slow, deliberate cursor. | No springy motion, no decorative bounce. |

---

## Export for Remotion

After the take, export the **raw demo clip** for the promo to embed:

- Format: **MP4 (H.264)**, **1920×1080**.
- Drop it at: **`/Users/sultanpeyek/codes/web3/chainbard/promo/public/demo.mp4`**
- The Remotion promo embeds this clip in its **embedded-demo segment, targeting ~15s** — so trim/select the most legible ~15s spine (Hook → Settle → Payoff payoff frame) for that embed, or export the full clip and let the promo window into it.
- Keep captions burned-in **only** on the social cuts; for the Remotion embed, prefer a clean (un-captioned) clip if available so the promo can add its own overlays.
