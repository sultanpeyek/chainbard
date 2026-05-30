// ChainBard brand tokens — source of truth: docs/brand.md
// Do not invent values; mirror the design system exactly.

export const COLORS = {
  ink: "#0b0a09", // primary ground (warm near-black — never pure #000)
  inkLine: "#2a2622", // borders / hairlines
  inkSoft: "#15120f", // raised surface
  bone: "#ece4d6", // primary text on ink
  boneDim: "#a39a8a", // secondary / captions
  amber: "#e8a13a", // THE single vivid accent (feather / links / key moments)
  amberDeep: "#b8791f", // pressed
  // Kind hues — quiet signals only (small dots / labels, never large fills)
  wallet: "#c9a24a",
  tx: "#7ba2c4",
  nft: "#b07cc6",
  token: "#5aa087",
} as const;

// Brand-correct entrance easing (crisp settle, no springy overshoot).
// CSS cubic-bezier(0.16, 1, 0.3, 1) — slow-in / settle per brand motion rules.
export const ENTER_BEZIER = [0.16, 1, 0.3, 1] as const;
// Editorial fade for crossfades / opacity holds.
export const FADE_BEZIER = [0.45, 0, 0.55, 1] as const;
