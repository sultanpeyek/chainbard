import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { COLORS } from "./brand";
import { BrandIntro } from "./scenes/BrandIntro";
import { Mint } from "./scenes/Mint";
import { OutroRecut } from "./scenes/Outro";
import { Paste } from "./scenes/Paste";
import { Payoff } from "./scenes/Payoff";
import { Source } from "./scenes/Source";

// ChainBard ~35s "epic recut" — 16:9, 1920x1080, 30fps, 1055 frames.
// Self-contained: no demo.mp4, no external footage — every product surface is an
// inline Remotion recreation. Subject: the BONK mint
// DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263.
//
// Beat sheet (absolute frames; local frame resets to 0 at each Sequence `from`):
//   BRAND   0–60    (2s)     chainbard cold-open lockup (first frame reads ChainBard)
//   SOURCE  60–120  (2s)     inline price-page mock — copy the BONK contract
//   PASTE   120–285 (5.5s)   inline MintWidget paste/detect surface
//   MINT    285–555 (9s)     inline MintConsole — 12-step briefless mint stream
//   PAYOFF  555–950 (13.2s)  hero/story holds, then descends to the sealed receipt dead-center
//   OUTRO   950–1055 (3.5s)  compact kicker + end card
//   60 + 60 + 165 + 270 + 395 + 105 = 1055. No gap, no overlap.
//
// SFX layer intentionally omitted: it is guarded OFF in the shell and the render
// never depends on audio, so the recut stays audio-independent without it.
export const ChainBardRecut: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.ink }}>
      <Sequence durationInFrames={60}>
        <BrandIntro />
      </Sequence>
      <Sequence from={60} durationInFrames={60}>
        <Source />
      </Sequence>
      <Sequence from={120} durationInFrames={165}>
        <Paste />
      </Sequence>
      <Sequence from={285} durationInFrames={270}>
        <Mint />
      </Sequence>
      <Sequence from={555} durationInFrames={395}>
        <Payoff />
      </Sequence>
      <Sequence from={950} durationInFrames={105}>
        <OutroRecut />
      </Sequence>
    </AbsoluteFill>
  );
};
