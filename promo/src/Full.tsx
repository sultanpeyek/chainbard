import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { COLORS } from "./brand";
import { Activity } from "./scenes/Activity";
import { AutoIntro } from "./scenes/AutoIntro";
import { Brain } from "./scenes/Brain";
import { BrandIntro } from "./scenes/BrandIntro";
import { Mint } from "./scenes/Mint";
import { OutroFull } from "./scenes/Outro";
import { Paste } from "./scenes/Paste";
import { Payoff } from "./scenes/Payoff";
import { Source } from "./scenes/Source";

// ChainBard ~55s FULL cut — 16:9, 1920x1080, 30fps, 1655 frames.
// The recut showed only the buyer-funded REACTIVE path; the full cut keeps that
// act intact, then adds the AGENT-FUNDED AUTONOMOUS act the README describes
// (the daily curator tick) and closes on the /activity proof surface + CTA.
// Self-contained: no demo.mp4 — every product surface is an inline recreation.
//
// Beat sheet (absolute frames; local frame resets to 0 at each Sequence `from`):
//   ── COLD OPEN ──
//   BRAND     0–60      (2s)     chainbard cold-open lockup (first frame reads ChainBard)
//   ── ACT I · REACTIVE (buyer-funded) ──
//   SOURCE    60–120    (2s)     copy the BONK contract off a price page
//   PASTE     120–285   (5.5s)   inline MintWidget paste/detect
//   MINT      285–555   (9s)     inline MintConsole — 12-step buyer mint
//   PAYOFF    555–950   (13.2s)  hero/story holds, then descends to the sealed receipt dead-center
//   ── ACT II · AUTONOMOUS (agent-funded) ──
//   AUTOINTRO 950–1055  (3.5s)  no human / no buyer — the cron tick fires
//   BRAIN     1055–1325 (9s)    inline curator console — 11-step agent tick
//   ACTIVITY  1325–1535 (7s)   /activity tick log + "inspect it live" CTA
//   ── ACT III · OUTRO ──
//   OUTRO     1535–1655 (4s)   kicker + end card + /activity CTA
//   60+60+165+270+395+105+270+210+120 = 1655. No gap, no overlap.
export const ChainBardFull: React.FC = () => {
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
        <AutoIntro />
      </Sequence>
      <Sequence from={1055} durationInFrames={270}>
        <Brain />
      </Sequence>
      <Sequence from={1325} durationInFrames={210}>
        <Activity />
      </Sequence>
      <Sequence from={1535} durationInFrames={120}>
        <OutroFull />
      </Sequence>
    </AbsoluteFill>
  );
};
