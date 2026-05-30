// Fonts loaded at module top-level per Remotion fonts rules.
// loadFont() blocks render until the font is ready.
import { loadFont as loadFraunces } from "@remotion/google-fonts/Fraunces";
import { loadFont as loadPlexMono } from "@remotion/google-fonts/IBMPlexMono";

// Fraunces — display serif: headings, narrative, story (brand display face).
const fraunces = loadFraunces("normal", {
  weights: ["400", "500", "600"],
  subsets: ["latin"],
});

// IBM Plex Mono — data/mono: identifiers, addresses, receipts, kind labels.
const plexMono = loadPlexMono("normal", {
  weights: ["400", "500"],
  subsets: ["latin"],
});

export const FONT_DISPLAY = fraunces.fontFamily; // Fraunces
export const FONT_MONO = plexMono.fontFamily; // IBM Plex Mono
