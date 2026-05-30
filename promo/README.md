# ChainBard — Promo (Remotion)

Self-contained branded promos. No external footage, no music — every product
surface is an inline Remotion recreation. **16:9 · 1920×1080 · 30fps.**

Two compositions:

- **`ChainBardRecut`** — short cut: buyer-funded reactive path (paste → mint → sealed share-page).
- **`ChainBardFull`** — full cut: the recut plus the autonomous agent act + `/activity` CTA.

## Commands

```bash
bun install          # first time
bun run dev          # remotion studio — live preview + the real beat sheet/timings
bun run render       # both → out/recut.mp4 + out/full.mp4
```

Also `render:recut` / `render:full` for one at a time. From repo root, prefix
`promo:` (`bun run promo:dev`, `bun run promo:render`).

## Source of truth

- **Timing & beats** live in the code (`src/Recut.tsx`, `src/Full.tsx`) and are
  visible in `bun run dev` — this README intentionally doesn't restate frame counts.
- **Brand tokens** (colors, fonts, motion): `../docs/brand.md`, mirrored in
  `src/brand.ts`. Don't invent values.
