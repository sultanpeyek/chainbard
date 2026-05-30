'use client';

// PROTOTYPE — throwaway. Share-page exploration for the on-chain storyteller.
// 4 kind-tailored templates: wallet · tx · NFT · token. Switch via bottom bar.
// Delete when answered.

import { usePathname, useRouter } from 'next/navigation';
import { use } from 'react';

type Tone = 'Tragedy' | 'Comedy' | 'Epic' | 'Elegy' | 'Forensic';
type KV = { label: string; value: string };

type WalletStory = {
  kind: 'wallet';
  input: string;
  tone: Tone;
  title: string;
  subtitle: string;
  palette: [string, string, string];
  stats: KV[];
  sections: { title: string; body: string }[];
  verdict: string;
};

type TxStory = {
  kind: 'tx';
  input: string;
  tone: Tone;
  title: string;
  subtitle: string;
  palette: [string, string, string];
  block: { slot: string; time: string; signerShort: string };
  meters: { fee: string; cu: string; programs: string; ixs: string };
  programs: { name: string; calls: number; tint: string }[];
  instructions: { idx: number; program: string; action: string; cu: string; reverted?: boolean }[];
  deltas: { who: string; before: string; after: string; delta: string; positive?: boolean }[];
  narrative: string;
  hinge: string;
  verdict: string;
};

type NftStory = {
  kind: 'mint';
  assetKind: 'nft';
  input: string;
  tone: Tone;
  title: string;
  subtitle: string;
  palette: [string, string, string];
  collection: string;
  rarityRank: string;
  rarityPct: string;
  art: { palette: [string, string, string] };
  traits: KV[];
  provenance: {
    short: string;
    duration: string;
    acquired: 'mint' | 'buy' | 'transfer' | 'recovery';
    note: string;
    price?: string;
  }[];
  drama: string;
  verdict: string;
};

type TokenStory = {
  kind: 'mint';
  assetKind: 'token';
  input: string;
  tone: Tone;
  title: string;
  subtitle: string;
  palette: [string, string, string];
  ticker: string;
  market: { supply: string; holders: string; launched: string; mcapATH: string };
  priceArc: number[];
  athIndex: number;
  holderBuckets: { range: string; count: number; pct: number }[];
  supply: { circulating: number; burned: number; locked: number };
  milestones: { date: string; event: string; pctChange?: string }[];
  community: string;
  verdict: string;
};

type Story = WalletStory | TxStory | NftStory | TokenStory;

/* -------------------------- fixtures -------------------------- */

const WALLET: WalletStory = {
  kind: 'wallet',
  input: 'B1aLAAe4vW8nSQCetXnYqJfRxzTjnbooasVZjUUtsKf',
  tone: 'Epic',
  title: 'The Architect of Quiet Bridges',
  subtitle: 'A wallet that arrived in the silence of 2020 and never left.',
  palette: ['#0b1d3a', '#c89b3c', '#f4ecd6'],
  stats: [
    { label: 'First seen', value: 'Mar 16, 2020' },
    { label: 'Txs', value: '47,219' },
    { label: 'SOL flowed', value: '1.2M' },
    { label: 'Eras', value: '5' },
  ],
  sections: [
    {
      title: 'Origin',
      body: 'Funded by a single 2.4 SOL transfer from a now-defunct exchange hot wallet, this address opened its eyes during the Mainnet Beta dawn. The first ten transactions were small, deliberate — a kind of stretching, as if testing the weight of a new language.',
    },
    {
      title: 'Companions',
      body: 'Three counterparties recur like leitmotifs: a multisig that built rails, a market-maker that whispered liquidity into the early DEXs, and a single solitary wallet — never named — that shows up only at inflection points.',
    },
    {
      title: 'Eras',
      body: 'The Quiet Year (2020). The Builder Spring (2021). The Long Winter (2022). The Reawakening (2023). The Architect (2024–now). Each era marked by a shift in counterparties, gas patterns, and the slow accretion of governance tokens.',
    },
    {
      title: 'The Crowning',
      body: 'On a Tuesday in September 2024, this wallet executed a 47-instruction transaction that rebalanced a treasury, settled a vesting cliff, and tipped a developer 12 SOL — all in one breath. It cost 0.000041 SOL. The block was full. The chain remembered.',
    },
    {
      title: 'The Drama',
      body: 'There was, once, a near-miss: a malicious program request, intercepted by what looks like a hardware-wallet refusal. The transaction failed at simulation. No funds were lost. But for four blocks, the wallet did not move.',
    },
  ],
  verdict:
    'This is a wallet that does not perform. It builds, it tends, it endures. If the chain has elders, this is one of them — quietly weaving the bridges others walk across.',
};

const TX: TxStory = {
  kind: 'tx',
  input: '5j7sN8pQwR3vYxZ2kLmH4nT6bA9cFgJpQwR8vYxZ2kLmH4nT6bA9cFgJpQwR8vYxZ2kLmH4nT6bA',
  tone: 'Forensic',
  title: 'The Forty-Seven Second Cascade',
  subtitle:
    'One transaction. Eight programs. Eighteen calls. A vault touched, a market reset, a fortune redistributed.',
  palette: ['#1a0b2e', '#e94560', '#f4ecd6'],
  block: { slot: '298,441,209', time: 'Feb 11, 2025 · 03:47:12 UTC', signerShort: 'GhE9…vKp2' },
  meters: { fee: '0.0042 SOL', cu: '1.18M', programs: '8', ixs: '18' },
  programs: [
    { name: 'Marginfi', calls: 2, tint: '#a78bfa' },
    { name: 'Jupiter', calls: 4, tint: '#fbbf24' },
    { name: 'Orca', calls: 3, tint: '#22d3ee' },
    { name: 'Drift', calls: 1, tint: '#34d399' },
    { name: 'Kamino', calls: 2, tint: '#f472b6' },
    { name: 'Token', calls: 3, tint: '#cbd5e1' },
    { name: 'Token2022', calls: 1, tint: '#a3e635' },
    { name: 'ComputeBudget', calls: 2, tint: '#fb7185' },
  ],
  instructions: [
    { idx: 1, program: 'ComputeBudget', action: 'setComputeUnitLimit (1.4M)', cu: '0' },
    { idx: 2, program: 'ComputeBudget', action: 'setComputeUnitPrice (50,000)', cu: '0' },
    { idx: 3, program: 'Marginfi', action: 'flash_loan_start (1.8M USDC)', cu: '54k' },
    { idx: 4, program: 'Token', action: 'transfer (1.8M USDC → router)', cu: '8k' },
    { idx: 5, program: 'Jupiter', action: 'route v6: USDC → SOL (600k)', cu: '128k' },
    { idx: 6, program: 'Orca', action: 'whirlpool swap A (200k USDC)', cu: '72k' },
    { idx: 7, program: 'Orca', action: 'whirlpool swap B (200k USDC)', cu: '68k' },
    { idx: 8, program: 'Orca', action: 'whirlpool swap C (200k USDC)', cu: '71k' },
    { idx: 9, program: 'Drift', action: 'close_perp_position (SOL-PERP short)', cu: '94k' },
    { idx: 10, program: 'Jupiter', action: 'route v6: SOL → USDC', cu: '52k', reverted: true },
    { idx: 11, program: 'Jupiter', action: 'route v6: SOL → USDC (retry)', cu: '142k' },
    { idx: 12, program: 'Jupiter', action: 'route v7: dust sweep', cu: '38k' },
    { idx: 13, program: 'Kamino', action: 'borrow_repay (1.2M USDC)', cu: '86k' },
    { idx: 14, program: 'Kamino', action: 'borrow_repay (600k USDC)', cu: '78k' },
    { idx: 15, program: 'Marginfi', action: 'flash_loan_repay (1.8M USDC + 0.18 fee)', cu: '61k' },
    { idx: 16, program: 'Token', action: 'transfer (47.2 SOL → signer)', cu: '8k' },
    { idx: 17, program: 'Token2022', action: 'transfer_fee_config (overlooked)', cu: '22k' },
    { idx: 18, program: 'Token', action: 'closeAccount (dust)', cu: '5k' },
  ],
  deltas: [
    {
      who: 'Signer (GhE9…vKp2)',
      before: '12.4 SOL',
      after: '59.6 SOL',
      delta: '+47.2 SOL',
      positive: true,
    },
    {
      who: 'Marginfi LP',
      before: '—',
      after: '+0.18 USDC',
      delta: '+0.18 USDC fee',
      positive: true,
    },
    {
      who: 'Orca pool (USDC/SOL)',
      before: 'TVL 4.2M',
      after: 'TVL 4.18M',
      delta: '−12.4 SOL drift',
    },
    { who: 'Drift insurance fund', before: '—', after: '—', delta: '+0.04 SOL' },
    { who: 'Throwaway #1', before: '0', after: '0.0001 SOL', delta: '+dust' },
  ],
  hinge:
    'Instruction 02 — a single setComputeUnitPrice bump, four micro-lamports above the median, executed before the borrow even started. That bump resolved the MEV race. Without it, this transaction is in the mempool history with the failures.',
  narrative:
    'Borrow → swap → arb → unwind. Forty-seven seconds from first signature confirmation to repayment. The flash loan was 1.8M USDC. The arb captured 47.2 SOL. Three throwaway accounts held just enough dust to make the trail readable but not traceable. One Jupiter route reverted on the first attempt — slippage breach — and a second route fired through a different DEX 200ms later.',
  verdict:
    'Not a hack. Not a bug. A ruthlessly priced piece of on-chain choreography. Three protocols paid the bill. One wallet went home with 47 SOL. The chain, indifferent, moved to the next slot.',
};

const NFT: NftStory = {
  kind: 'mint',
  assetKind: 'nft',
  input: 'BzG3LcMaskBearer4267xKqPnRvSwTzAa9BCdEfGhJk',
  tone: 'Elegy',
  title: 'Mask Bearer №4267',
  subtitle:
    'Minted in the bull. Sold in the bear. Bought back. The cycle of one cNFT, told in nine hands.',
  palette: ['#2b1810', '#d4a574', '#f4ecd6'],
  collection: 'Mask Bearers',
  rarityRank: '#36 / 8,888',
  rarityPct: 'top 0.4%',
  art: { palette: ['#2b1810', '#d4a574', '#7c2d12'] },
  traits: [
    { label: 'Mask', value: 'Crimson Hex' },
    { label: 'Robe', value: 'Indigo Wave' },
    { label: 'Background', value: 'Desert Dawn' },
    { label: 'Glyph', value: 'Triple Crescent (×52)' },
  ],
  provenance: [
    {
      short: 'Wallet 0 (minter)',
      duration: '0d',
      acquired: 'mint',
      note: 'Mint · third drop wave',
      price: '4.2 SOL',
    },
    { short: 'GhE…vKp', duration: '11d', acquired: 'buy', note: 'First flip', price: '6.8 SOL' },
    {
      short: 'mEv…3Lk',
      duration: '57m',
      acquired: 'buy',
      note: 'Inside-the-hour flip',
      price: '8.1 SOL',
    },
    {
      short: 'Avatar.sol',
      duration: '14mo',
      acquired: 'buy',
      note: 'PFP shrine era · Twitter avatar',
      price: '12 SOL',
    },
    {
      short: 'Sun…8Tz',
      duration: '23min',
      acquired: 'buy',
      note: 'Sunday peak · Coinbase buyer',
      price: '142 SOL',
    },
    {
      short: 'drainer-flagged',
      duration: '8h',
      acquired: 'transfer',
      note: 'Theft · three drainer lists',
    },
    {
      short: 'Solanart escrow',
      duration: '9d',
      acquired: 'recovery',
      note: 'Recovery thread → escrow return',
    },
    {
      short: 'Avatar.sol',
      duration: '6mo',
      acquired: 'buy',
      note: 'Bought back · PFP returned',
      price: '38 SOL',
    },
    {
      short: '???',
      duration: '3w',
      acquired: 'buy',
      note: 'Anonymous · current holder',
      price: '24 SOL',
    },
  ],
  drama:
    'October 12, 2025: this mint moved to a wallet on three drainer lists. Eight hours later, recovery began. Nine days after that, it was back in escrow. The drainer wallet has not moved since.',
  verdict:
    'Not the rarest in the set. Not the most expensive. But held, lost, recovered, and held again — and that is rarer than rarity.',
};

const TOKEN: TokenStory = {
  kind: 'mint',
  assetKind: 'token',
  input: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  tone: 'Comedy',
  title: 'The Dog That Wagged the Chain',
  subtitle:
    'A meme launched as a joke, distributed for free, that became the third-largest community on Solana.',
  palette: ['#3d2914', '#f7b500', '#fff4d6'],
  ticker: 'BONK',
  market: { supply: '92.7T', holders: '784,219', launched: 'Dec 25, 2022', mcapATH: '$3.8B' },
  priceArc: [
    0.02, 0.03, 0.04, 0.06, 0.08, 0.12, 0.18, 0.16, 0.22, 0.35, 0.3, 0.42, 0.55, 0.48, 0.65, 0.8,
    0.72, 0.88, 1.0, 0.85, 0.7, 0.62, 0.55, 0.5,
  ],
  athIndex: 18,
  holderBuckets: [
    { range: '< 1M tokens', count: 612000, pct: 78 },
    { range: '1M – 10M', count: 124000, pct: 16 },
    { range: '10M – 100M', count: 38000, pct: 5 },
    { range: '100M – 1B', count: 8200, pct: 1 },
    { range: '> 1B (whales)', count: 219, pct: 0.03 },
  ],
  supply: { circulating: 71, burned: 24, locked: 5 },
  milestones: [
    { date: 'Dec 25, 2022', event: 'Christmas airdrop · 187k wallets, no presale' },
    { date: 'Jan 2023', event: 'The First Awakening', pctChange: '+400%' },
    { date: 'Oct 2023', event: 'First major CEX listing', pctChange: '+1,200%' },
    { date: 'Mar 5, 2024', event: 'ATH · $3.8B mcap', pctChange: '+800%' },
    { date: 'Feb 2024', event: '5T community burn (41 txs / 3 days)', pctChange: '+22% / −18%' },
  ],
  community:
    'Magazine. Art collective. Validator army. Governance bloc. 784,000 wallets that agreed a joke was worth holding.',
  verdict: 'Not a token. A coordination test that Solana passed.',
};

const STORIES: Record<string, Story> = {
  [WALLET.input]: WALLET,
  [TX.input]: TX,
  [NFT.input]: NFT,
  [TOKEN.input]: TOKEN,
};

function pickStory(input: string): Story {
  return STORIES[input] ?? { ...WALLET, input };
}

const PRESETS: { id: string; input: string; label: string }[] = [
  { id: 'wallet', input: WALLET.input, label: 'wallet' },
  { id: 'tx', input: TX.input, label: 'tx' },
  { id: 'nft', input: NFT.input, label: 'NFT' },
  { id: 'token', input: TOKEN.input, label: 'token' },
];

/* -------------------------- page entry -------------------------- */

export default function StoryPrototypePage({ params }: { params: Promise<{ input: string }> }) {
  const { input } = use(params);
  const story = pickStory(decodeURIComponent(input));

  return (
    <>
      <PrototypeRibbon />
      {story.kind === 'wallet' && <WalletStoryView story={story} />}
      {story.kind === 'tx' && <TxStoryView story={story} />}
      {story.kind === 'mint' && story.assetKind === 'nft' && <NftStoryView story={story} />}
      {story.kind === 'mint' && story.assetKind === 'token' && <TokenStoryView story={story} />}
      <PresetSwitcherBar current={story.input} />
    </>
  );
}

/* -------------------------- shared chrome -------------------------- */

function PrototypeRibbon() {
  return (
    <div className="fixed top-0 left-0 z-50 bg-yellow-300 text-black text-[10px] font-mono px-2 py-0.5 uppercase tracking-wider">
      Prototype · throwaway
    </div>
  );
}

function PresetSwitcherBar({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex gap-1 rounded-full bg-black/90 p-1 shadow-2xl backdrop-blur">
      {PRESETS.map((p) => {
        const active = p.input === current;
        return (
          <button
            type="button"
            key={p.id}
            onClick={() => {
              const next = `/story-prototype/${p.input}`;
              if (next !== pathname) router.replace(next, { scroll: false });
            }}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
              active ? 'bg-white text-black' : 'text-white/70 hover:text-white'
            }`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

function InputBar({ input, theme = 'light' }: { input: string; theme?: 'light' | 'dark' }) {
  const dark = theme === 'dark';
  return (
    <div
      className={`w-full backdrop-blur border-b px-4 py-3 flex items-center gap-2 sticky top-0 z-30 ${
        dark ? 'bg-zinc-950/80 border-white/10' : 'bg-white/80 border-black/10'
      }`}
    >
      <span className={`text-xs font-mono ${dark ? 'text-amber-400/70' : 'text-zinc-500'}`}>
        solana://
      </span>
      <input
        readOnly
        value={input}
        className={`flex-1 bg-transparent text-sm font-mono outline-none truncate ${
          dark ? 'text-white/90' : 'text-zinc-900'
        }`}
      />
      <button
        type="button"
        className={`text-xs px-3 py-1.5 rounded-full font-medium ${
          dark ? 'bg-white text-black hover:bg-zinc-200' : 'bg-black text-white hover:bg-zinc-800'
        }`}
      >
        Tell another
      </button>
    </div>
  );
}

function ShareRow({ theme = 'light', price }: { theme?: 'light' | 'dark'; price?: string }) {
  const dark = theme === 'dark';
  const btn = dark
    ? 'border border-white/15 bg-white/5 hover:bg-white/10 text-white'
    : 'border border-black/10 bg-white hover:bg-zinc-50';
  return (
    <div
      className={`flex flex-wrap gap-2 justify-center py-8 ${dark ? 'border-t border-white/10' : 'border-t border-black/5'}`}
    >
      {[
        { label: 'Copy link', icon: '🔗' },
        { label: 'Tweet', icon: '𝕏' },
        { label: 'PNG', icon: '🖼' },
        { label: 'MP4', icon: '🎞' },
      ].map((b) => (
        <button
          key={b.label}
          type="button"
          className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${btn}`}
        >
          <span>{b.icon}</span>
          {b.label}
        </button>
      ))}
      {price ? (
        <button
          type="button"
          className="flex items-center gap-2 rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400"
        >
          ✦ Mint your own — {price}
        </button>
      ) : null}
    </div>
  );
}

function Meter({ label, value, dark = true }: { label: string; value: string; dark?: boolean }) {
  return (
    <div className={dark ? 'bg-black p-4' : 'bg-white p-4'}>
      <div
        className={`text-[10px] uppercase tracking-wider ${dark ? 'text-zinc-500' : 'text-zinc-500'}`}
      >
        {label}
      </div>
      <div className={`mt-1 font-mono text-xl ${dark ? 'text-white' : 'text-zinc-900'}`}>
        {value}
      </div>
    </div>
  );
}

/* -------------------------- wallet (cinematic narrative) -------------------------- */

type ImageProvenance = 'generated' | 'real';

function ImageBadge({
  kind,
  position = 'br',
}: {
  kind: ImageProvenance;
  position?: 'tl' | 'tr' | 'bl' | 'br';
}) {
  const pos = {
    tl: 'top-2 left-2',
    tr: 'top-2 right-2',
    bl: 'bottom-2 left-2',
    br: 'bottom-2 right-2',
  }[position];
  const styles =
    kind === 'generated' ? 'bg-amber-400/95 text-black' : 'bg-emerald-400/95 text-emerald-950';
  const text = kind === 'generated' ? '✦ generated · ai image' : '⛓ on-chain asset';
  return (
    <div
      className={`absolute ${pos} z-10 rounded-full px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider shadow ${styles}`}
    >
      {text}
    </div>
  );
}

type StoryImageKind = 'wallet' | 'tx' | 'nft' | 'token';

const _GLYPH: Record<StoryImageKind, string> = {
  wallet: 'bio',
  tx: 'flow',
  nft: 'saga',
  token: 'market',
};

function GeneratedStoryImage({
  kind,
  palette,
  height = 'h-64',
  rounded = true,
  badgePosition = 'br',
}: {
  kind: StoryImageKind;
  palette: [string, string, string];
  height?: string;
  rounded?: boolean;
  badgePosition?: 'tl' | 'tr' | 'bl' | 'br';
}) {
  const [bg, ink, paper] = palette;
  const patternId = `geo-${kind}`;
  const horizonId = `horizon-${kind}`;
  return (
    <div
      className={`relative overflow-hidden ${height} ${rounded ? 'rounded-lg' : ''}`}
      style={{ background: `linear-gradient(180deg, ${bg} 0%, #000 100%)` }}
    >
      <svg
        viewBox="0 0 800 400"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <defs>
          <pattern id={patternId} x="0" y="0" width="80" height="80" patternUnits="userSpaceOnUse">
            <path
              d="M40 0 L80 40 L40 80 L0 40 Z M40 20 L60 40 L40 60 L20 40 Z"
              fill="none"
              stroke={ink}
              strokeWidth="0.6"
              opacity="0.35"
            />
          </pattern>
          <linearGradient id={horizonId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={paper} stopOpacity="0" />
            <stop offset="100%" stopColor={paper} stopOpacity="0.25" />
          </linearGradient>
        </defs>
        <rect width="800" height="400" fill={`url(#${patternId})`} />
        <rect width="800" height="400" fill={`url(#${horizonId})`} />

        {kind === 'wallet' && (
          <>
            <path
              d="M0 320 L120 320 L140 200 L160 320 L300 320 L320 240 L340 320 L520 320 L540 180 L560 320 L800 320 L800 400 L0 400 Z"
              fill="#000"
              opacity="0.55"
            />
            <circle cx="640" cy="90" r="38" fill={paper} opacity="0.85" />
            <circle cx="660" cy="80" r="34" fill={bg} opacity="0.9" />
          </>
        )}

        {kind === 'tx' && (
          <>
            <g transform="translate(400 220)">
              <circle r="170" fill="none" stroke={ink} strokeWidth="1.2" opacity="0.45" />
              <circle r="120" fill="none" stroke={ink} strokeWidth="1.2" opacity="0.55" />
              <circle r="70" fill="none" stroke={ink} strokeWidth="1.2" opacity="0.7" />
              <circle r="22" fill={paper} opacity="0.9" />
              <circle r="10" fill={bg} />
              {Array.from({ length: 12 }).map((_, i) => {
                const r = (i * 30 * Math.PI) / 180;
                const x = Math.cos(r) * 170;
                const y = Math.sin(r) * 170;
                return (
                  <circle
                    key={i}
                    cx={x}
                    cy={y}
                    r={i % 3 === 0 ? 7 : 4}
                    fill={ink}
                    opacity={i % 3 === 0 ? 0.95 : 0.6}
                  />
                );
              })}
              {Array.from({ length: 6 }).map((_, i) => {
                const r = (i * 60 * Math.PI) / 180;
                const x = Math.cos(r) * 70;
                const y = Math.sin(r) * 70;
                return (
                  <line
                    key={i}
                    x1={0}
                    y1={0}
                    x2={x}
                    y2={y}
                    stroke={paper}
                    strokeWidth="1"
                    opacity="0.4"
                  />
                );
              })}
            </g>
            <line
              x1="0"
              y1="385"
              x2="800"
              y2="385"
              stroke={paper}
              strokeWidth="0.5"
              opacity="0.4"
            />
          </>
        )}

        {kind === 'nft' && (
          <>
            <g transform="translate(400 320)">
              <path
                d="M-150 0 L-150 -150 A 150 150 0 0 1 150 -150 L 150 0 Z"
                fill="#000"
                opacity="0.55"
              />
              <path
                d="M-125 -8 L-125 -130 A 125 125 0 0 1 125 -130 L 125 -8 Z"
                fill="none"
                stroke={paper}
                strokeWidth="1"
                opacity="0.55"
              />
              <path
                d="M-95 -8 L-95 -110 A 95 95 0 0 1 95 -110 L 95 -8 Z"
                fill={bg}
                opacity="0.85"
              />
              <path
                d="M-95 -8 L-95 -110 A 95 95 0 0 1 95 -110 L 95 -8 Z"
                fill="none"
                stroke={ink}
                strokeWidth="0.7"
                opacity="0.6"
              />
            </g>
            <circle cx="640" cy="100" r="32" fill={paper} opacity="0.85" />
            <circle cx="656" cy="92" r="28" fill={bg} opacity="0.9" />
            <line x1="0" y1="320" x2="800" y2="320" stroke={ink} strokeWidth="0.5" opacity="0.4" />
          </>
        )}

        {kind === 'token' && (
          <>
            <g transform="translate(0 400)">
              {[
                [60, 80],
                [160, 140],
                [260, 110],
                [360, 200],
                [460, 170],
                [560, 250],
                [660, 180],
              ].map(([x, h]) => (
                <rect key={x} x={x} y={-h} width="80" height={h} fill="#000" opacity="0.55" />
              ))}
            </g>
            <g transform="translate(0 400)">
              {[
                [60, 80],
                [160, 140],
                [260, 110],
                [360, 200],
                [460, 170],
                [560, 250],
                [660, 180],
              ].map(([x, h]) => (
                <rect key={x} x={x} y={-h} width="80" height="3" fill={paper} opacity="0.7" />
              ))}
            </g>
            <circle cx="640" cy="90" r="44" fill={paper} opacity="0.85" />
            <circle cx="660" cy="80" r="40" fill={bg} opacity="0.9" />
          </>
        )}
      </svg>
      <ImageBadge kind="generated" position={badgePosition} />
    </div>
  );
}

function RealAssetCoin({ ticker, palette }: { ticker: string; palette: [string, string, string] }) {
  const [bg, fg, accent] = palette;
  return (
    <div
      className="relative aspect-square w-full rounded-full overflow-hidden shadow-2xl ring-4 ring-amber-400/30"
      style={{ background: bg }}
    >
      <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full" aria-hidden>
        <defs>
          <radialGradient id="coin-bevel" cx="50%" cy="38%" r="60%">
            <stop offset="0%" stopColor={fg} stopOpacity="0.45" />
            <stop offset="100%" stopColor={bg} stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="100" cy="100" r="98" fill={bg} />
        <circle cx="100" cy="100" r="98" fill="url(#coin-bevel)" />
        <circle
          cx="100"
          cy="100"
          r="86"
          fill="none"
          stroke={accent}
          strokeWidth="1"
          opacity="0.6"
        />
        {Array.from({ length: 36 }).map((_, i) => {
          const r = (i * 10 * Math.PI) / 180;
          const x = 100 + Math.cos(r) * 92;
          const y = 100 + Math.sin(r) * 92;
          return <circle key={i} cx={x} cy={y} r="1" fill={accent} opacity="0.65" />;
        })}
        <text
          x="50%"
          y="58%"
          textAnchor="middle"
          fontFamily="serif"
          fontSize="34"
          fill={fg}
          fontWeight="700"
        >
          ${ticker}
        </text>
      </svg>
      <ImageBadge kind="real" position="br" />
    </div>
  );
}

function WalletStoryView({ story }: { story: WalletStory }) {
  return (
    <div className="min-h-screen bg-black text-white">
      <InputBar input={story.input} theme="dark" />
      <section className="relative h-[90vh] w-full overflow-hidden">
        <GeneratedStoryImage
          kind="wallet"
          palette={story.palette}
          height="h-full"
          rounded={false}
          badgePosition="tr"
        />
        <div className="absolute inset-0 bg-linear-to-b from-black/40 via-transparent to-black pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 p-8 max-w-3xl mx-auto">
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider backdrop-blur">
              wallet
            </span>
            <span className="rounded bg-amber-500/20 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber-200">
              tone · {story.tone}
            </span>
            <span className="ml-auto rounded bg-white/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider backdrop-blur">
              ▶ cinematic reel · 0:42
            </span>
          </div>
          <h1 className="mt-4 font-serif text-5xl sm:text-6xl leading-none tracking-tight">
            {story.title}
          </h1>
          <p className="mt-3 text-xl text-white/80 italic max-w-xl">{story.subtitle}</p>
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-6 -mt-8 relative z-10">
        <div className="rounded-lg bg-zinc-900/80 backdrop-blur border border-white/5 p-3 grid grid-cols-2 sm:grid-cols-4 gap-px">
          {story.stats.map((s) => (
            <Meter key={s.label} label={s.label} value={s.value} />
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-24 space-y-28">
        {story.sections.map((s, i) => (
          <section
            key={i}
            className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-6 sm:gap-10 items-start"
          >
            <div className="font-mono text-sm text-amber-400/80 sm:text-right sm:w-20">
              {String(i + 1).padStart(2, '0')}
            </div>
            <div>
              <h2 className="font-serif text-3xl text-white">{s.title}</h2>
              <div className="mt-2 h-px w-12 bg-amber-400/60" />
              <p className="mt-5 text-lg leading-relaxed text-white/80">{s.body}</p>
            </div>
          </section>
        ))}
        <section className="border-l-2 border-amber-400 pl-4">
          <p className="font-mono text-xs uppercase tracking-wider text-amber-300/80">Verdict</p>
          <p className="mt-2 text-xl text-white">{story.verdict}</p>
        </section>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto max-w-3xl px-6">
          <ShareRow theme="dark" price="0.30 USDC" />
        </div>
      </div>
      <div className="pb-28 text-center text-xs text-white/30 font-mono">
        chainbard · wallet bio · {story.input.slice(0, 8)}…
      </div>
    </div>
  );
}

/* -------------------------- tx (forensic dashboard) -------------------------- */

function TxStoryView({ story }: { story: TxStory }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <InputBar input={story.input} theme="dark" />

      <section className="border-b border-white/5">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span className="bg-rose-500/15 text-rose-300 rounded px-2 py-0.5 font-mono uppercase tracking-wider">
              tx
            </span>
            <span className="bg-zinc-800 text-zinc-300 rounded px-2 py-0.5 font-mono uppercase tracking-wider">
              tone · {story.tone}
            </span>
            <span className="ml-auto font-mono text-xs text-zinc-500">slot {story.block.slot}</span>
          </div>
          <h1 className="mt-4 font-serif text-4xl sm:text-5xl tracking-tight">{story.title}</h1>
          <p className="mt-3 text-lg text-zinc-400 italic max-w-2xl">{story.subtitle}</p>

          <div className="mt-8 flex flex-wrap gap-2 font-mono text-xs">
            <span className="bg-white/5 rounded px-2 py-1">
              <span className="text-zinc-500">time </span>
              <span className="text-zinc-200">{story.block.time}</span>
            </span>
            <span className="bg-white/5 rounded px-2 py-1">
              <span className="text-zinc-500">signer </span>
              <span className="text-zinc-200">{story.block.signerShort}</span>
            </span>
            <span className="bg-white/5 rounded px-2 py-1">
              <span className="text-zinc-500">sig </span>
              <span className="text-zinc-200">
                {story.input.slice(0, 12)}…{story.input.slice(-6)}
              </span>
            </span>
          </div>

          <div className="mt-8">
            <GeneratedStoryImage kind="tx" palette={story.palette} height="h-72 sm:h-80" />
            <p className="mt-2 text-[11px] font-mono text-zinc-500 text-right">
              Content-policy-compliant story image · no animate forms · Midjourney via Ace
            </p>
          </div>
        </div>
      </section>

      <section className="bg-black border-b border-white/5">
        <div className="mx-auto max-w-5xl px-6 py-6 grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/5 rounded overflow-hidden">
          <Meter label="Fee" value={story.meters.fee} />
          <Meter label="Compute units" value={story.meters.cu} />
          <Meter label="Programs" value={story.meters.programs} />
          <Meter label="Instructions" value={story.meters.ixs} />
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-10">
        <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-500">
          Programs touched
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {story.programs.map((p) => (
            <div
              key={p.name}
              className="flex items-center gap-2 rounded border border-white/10 px-3 py-1.5 text-sm"
            >
              <span className="h-2 w-2 rounded-full" style={{ background: p.tint }} />
              <span className="font-medium">{p.name}</span>
              <span className="font-mono text-xs text-zinc-500">×{p.calls}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-10">
        <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-500">
          Instruction stack
        </h2>
        <div className="mt-3 rounded-lg border border-white/10 overflow-hidden">
          {story.instructions.map((ix) => {
            const tint = story.programs.find((p) => p.name === ix.program)?.tint ?? '#666';
            return (
              <div
                key={ix.idx}
                className={`grid grid-cols-[2.5rem_0.5rem_8rem_1fr_auto] items-center gap-3 px-3 py-2 border-b border-white/5 last:border-0 text-sm ${
                  ix.reverted ? 'bg-rose-500/5' : ''
                }`}
              >
                <span className="font-mono text-xs text-zinc-500 text-right">
                  {String(ix.idx).padStart(2, '0')}
                </span>
                <span className="h-2 w-2 rounded-full" style={{ background: tint }} />
                <span className="font-medium text-zinc-200">{ix.program}</span>
                <span
                  className={`font-mono text-xs sm:text-sm ${ix.reverted ? 'text-rose-300 line-through' : 'text-zinc-400'}`}
                >
                  {ix.action}
                </span>
                <span className="font-mono text-xs text-zinc-500">{ix.cu} CU</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-10">
        <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-500">Balance deltas</h2>
        <div className="mt-3 rounded-lg border border-white/10 overflow-hidden">
          <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-4 px-4 py-2 text-[10px] font-mono uppercase tracking-wider text-zinc-500 border-b border-white/10 bg-white/2">
            <span>Who</span>
            <span>Before</span>
            <span>After</span>
            <span>Δ</span>
          </div>
          {story.deltas.map((d) => (
            <div
              key={d.who}
              className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-4 px-4 py-3 text-sm border-b border-white/5 last:border-0"
            >
              <span className="text-zinc-200">{d.who}</span>
              <span className="font-mono text-zinc-400">{d.before}</span>
              <span className="font-mono text-zinc-400">{d.after}</span>
              <span className={`font-mono ${d.positive ? 'text-emerald-400' : 'text-rose-300'}`}>
                {d.delta}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-8">
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-5">
          <p className="text-xs font-mono uppercase tracking-wider text-rose-300">The hinge</p>
          <p className="mt-2 text-base leading-relaxed text-zinc-200">{story.hinge}</p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-10">
        <p className="text-lg leading-relaxed text-zinc-300">{story.narrative}</p>
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-12 border-l-2 border-rose-500/60 pl-6">
        <p className="text-xs font-mono uppercase tracking-wider text-rose-300/80">Verdict</p>
        <p className="mt-2 text-xl text-white">{story.verdict}</p>
      </section>

      <div className="border-t border-white/10">
        <div className="mx-auto max-w-3xl px-6">
          <ShareRow theme="dark" price="0.30 USDC" />
        </div>
      </div>
      <div className="pb-28 text-center text-xs text-white/30 font-mono">
        chainbard · tx forensic · {story.input.slice(0, 12)}…
      </div>
    </div>
  );
}

/* -------------------------- NFT (asset showcase + provenance) -------------------------- */

function NftArtCard({
  palette,
  title,
  rarity,
}: {
  palette: [string, string, string];
  title: string;
  rarity: string;
}) {
  const [bg, fg, accent] = palette;
  return (
    <div
      className="relative aspect-square rounded-2xl overflow-hidden shadow-2xl"
      style={{ background: bg }}
    >
      <svg viewBox="0 0 400 400" className="absolute inset-0 w-full h-full" aria-hidden>
        <defs>
          <pattern id="nft-geo" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
            <path
              d="M20 0 L40 20 L20 40 L0 20 Z"
              fill="none"
              stroke={accent}
              strokeWidth="0.5"
              opacity="0.4"
            />
            <circle cx="20" cy="20" r="1.5" fill={fg} opacity="0.4" />
          </pattern>
          <radialGradient id="nft-glow" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor={fg} stopOpacity="0.25" />
            <stop offset="100%" stopColor={bg} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="400" height="400" fill="url(#nft-geo)" />
        <rect width="400" height="400" fill="url(#nft-glow)" />
        {/* mask figure — no face, geometric only */}
        <g transform="translate(200 200)">
          <circle r="90" fill="none" stroke={fg} strokeWidth="2" opacity="0.7" />
          <circle r="60" fill={accent} opacity="0.85" />
          <path d="M-40 -10 L40 -10 L25 25 L-25 25 Z" fill={bg} />
          <path
            d="M-30 -10 L-12 8 M30 -10 L12 8 M-8 12 L8 12"
            stroke={fg}
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path d="M-90 90 L0 50 L90 90 L0 130 Z" fill={fg} opacity="0.95" />
          <path d="M0 -80 L-10 -98 L10 -98 Z" fill={fg} />
          {/* triple crescents (trait) */}
          <path d="M-110 -110 a 8 8 0 1 0 6 6" fill="none" stroke={accent} strokeWidth="2" />
          <path d="M110 -110 a 8 8 0 1 0 6 6" fill="none" stroke={accent} strokeWidth="2" />
          <path d="M0 -130 a 8 8 0 1 0 6 6" fill="none" stroke={accent} strokeWidth="2" />
        </g>
      </svg>
      <div className="absolute top-3 right-3 z-10 bg-black/70 text-amber-300 backdrop-blur rounded-full px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider">
        {rarity}
      </div>
      <ImageBadge kind="real" position="tl" />
      <div className="absolute bottom-0 inset-x-0 p-4 bg-linear-to-t from-black/85 to-transparent">
        <div className="font-serif text-white text-xl">{title}</div>
      </div>
    </div>
  );
}

function NftStoryView({ story }: { story: NftStory }) {
  const dot: Record<NftStory['provenance'][number]['acquired'], string> = {
    mint: 'bg-emerald-500',
    buy: 'bg-stone-500',
    transfer: 'bg-rose-500',
    recovery: 'bg-amber-500',
  };
  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      <InputBar input={story.input} />

      <section className="mx-auto max-w-5xl px-6 py-12 grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
        <NftArtCard palette={story.art.palette} title={story.title} rarity={story.rarityRank} />

        <div>
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span className="bg-stone-900 text-white rounded px-2 py-0.5 font-mono uppercase tracking-wider">
              mint · nft
            </span>
            <span className="border border-stone-300 rounded px-2 py-0.5 font-mono uppercase tracking-wider">
              tone · {story.tone}
            </span>
            <span className="ml-auto inline-flex items-center gap-2 bg-amber-200 rounded-full px-3 py-1 text-[10px] font-mono uppercase">
              <span className="text-amber-900">{story.rarityRank}</span>
              <span className="text-amber-700">· {story.rarityPct}</span>
            </span>
          </div>
          <h1 className="mt-4 font-serif text-4xl sm:text-5xl tracking-tight">{story.title}</h1>
          <p className="mt-2 italic text-stone-600 text-lg">{story.subtitle}</p>

          <div className="mt-6">
            <div className="font-mono text-[10px] uppercase tracking-wider text-stone-500">
              Collection
            </div>
            <div className="text-lg font-medium">{story.collection}</div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            {story.traits.map((t) => (
              <div key={t.label} className="border border-stone-200 rounded p-3 bg-white">
                <div className="text-[10px] uppercase tracking-wider text-stone-500">{t.label}</div>
                <div className="text-sm font-medium text-stone-900">{t.value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-4">
        <h2 className="font-serif text-3xl">Nine Hands</h2>
        <p className="mt-1 text-sm text-stone-500">The full provenance, mint to now.</p>
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-12">
        <ol className="space-y-0">
          {story.provenance.map((p, i) => (
            <li key={i} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className={`h-3 w-3 rounded-full ${dot[p.acquired]} ring-4 ring-stone-100`} />
                {i < story.provenance.length - 1 && (
                  <div className="flex-1 w-px bg-stone-300 mt-1" />
                )}
              </div>
              <div className="flex-1 pb-6">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="font-mono text-sm font-semibold">{p.short}</span>
                  <span className="text-xs text-stone-500">held {p.duration}</span>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-stone-400">
                    {p.acquired}
                  </span>
                  {p.price && (
                    <span className="ml-auto font-mono text-sm text-stone-800">{p.price}</span>
                  )}
                </div>
                <div className="text-sm text-stone-600 mt-1">{p.note}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-12">
        <blockquote className="border-l-4 border-rose-500 pl-6 italic text-lg text-stone-700">
          {story.drama}
        </blockquote>
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-12">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-serif text-2xl text-stone-900">Story image</h2>
          <span className="text-[11px] font-mono uppercase tracking-wider text-stone-500">
            Content-policy-compliant · echoes the saga, not the asset
          </span>
        </div>
        <GeneratedStoryImage kind="nft" palette={story.palette} height="h-72 sm:h-80" />
        <p className="mt-2 text-[11px] font-mono text-stone-500 text-right">
          Midjourney via Ace · prompted from on-chain signals
        </p>
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-12 border-t border-stone-300 pt-6">
        <p className="font-mono text-xs uppercase tracking-wider text-stone-500">Verdict</p>
        <p className="mt-2 text-xl">{story.verdict}</p>
      </section>

      <div className="mx-auto max-w-3xl px-6">
        <ShareRow price="0.30 USDC" />
      </div>
      <div className="pb-28 text-center text-xs text-stone-400 font-mono">
        chainbard · cNFT saga · {story.input.slice(0, 12)}…
      </div>
    </div>
  );
}

/* -------------------------- token (market dashboard) -------------------------- */

function PriceArc({ points, athIndex }: { points: number[]; athIndex: number }) {
  const w = 800;
  const h = 200;
  const padTop = 16;
  const padBot = 12;
  const stepX = w / (points.length - 1);
  const path = points
    .map((p, i) => {
      const x = (i * stepX).toFixed(1);
      const y = (h - p * (h - padTop - padBot) - padBot).toFixed(1);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
  const athX = athIndex * stepX;
  const athY = h - points[athIndex] * (h - padTop - padBot) - padBot;
  return (
    <svg viewBox={`0 0 ${w} ${h + 30}`} className="w-full" aria-hidden>
      <defs>
        <linearGradient id="arc-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#f7b500" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#f7b500" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L ${w} ${h} L 0 ${h} Z`} fill="url(#arc-fill)" />
      <path d={path} fill="none" stroke="#f7b500" strokeWidth="2.5" strokeLinejoin="round" />
      <line
        x1={athX}
        y1={athY + 6}
        x2={athX}
        y2={h + 6}
        stroke="#f7b500"
        strokeWidth="1"
        strokeDasharray="3 3"
        opacity="0.7"
      />
      <circle cx={athX} cy={athY} r="6" fill="#f7b500" />
      <text
        x={athX}
        y={h + 24}
        textAnchor="middle"
        fontSize="11"
        fill="#f7b500"
        fontFamily="monospace"
      >
        ATH
      </text>
    </svg>
  );
}

function TokenStoryView({ story }: { story: TokenStory }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <InputBar input={story.input} theme="dark" />

      <section className="border-b border-white/5">
        <div className="mx-auto max-w-5xl px-6 pt-12">
          <div className="flex items-start gap-5">
            <div className="shrink-0 w-20 h-20 sm:w-28 sm:h-28">
              <RealAssetCoin ticker={story.ticker} palette={story.palette} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <span className="bg-amber-500/15 text-amber-300 rounded px-2 py-0.5 font-mono uppercase tracking-wider">
                  mint · token
                </span>
                <span className="bg-zinc-800 text-zinc-300 rounded px-2 py-0.5 font-mono uppercase tracking-wider">
                  tone · {story.tone}
                </span>
                <span className="ml-auto font-mono text-xs text-amber-300">${story.ticker}</span>
              </div>
              <h1 className="mt-3 font-serif text-4xl sm:text-5xl tracking-tight">{story.title}</h1>
              <p className="mt-2 italic text-zinc-400 text-lg">{story.subtitle}</p>
            </div>
          </div>

          <div className="mt-8">
            <GeneratedStoryImage kind="token" palette={story.palette} height="h-64 sm:h-80" />
            <p className="mt-2 text-[11px] font-mono text-zinc-500 text-right">
              Content-policy-compliant story image · echoes the market arc, not the meme ·
              Midjourney via Ace
            </p>
          </div>

          <div className="mt-8 pb-8">
            <PriceArc points={story.priceArc} athIndex={story.athIndex} />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/10 rounded overflow-hidden">
          <Meter label="Supply" value={story.market.supply} />
          <Meter label="Holders" value={story.market.holders} />
          <Meter label="Launched" value={story.market.launched} />
          <Meter label="ATH mcap" value={story.market.mcapATH} />
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-6">
        <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-500">
          Holder distribution
        </h2>
        <div className="mt-4 space-y-2">
          {story.holderBuckets.map((b) => (
            <div
              key={b.range}
              className="grid grid-cols-[140px_1fr_auto] gap-4 items-center text-sm"
            >
              <span className="font-mono text-zinc-300">{b.range}</span>
              <div className="h-3 rounded bg-white/5 overflow-hidden">
                <div
                  className="h-full bg-amber-400 rounded"
                  style={{ width: `${Math.max(b.pct, 0.5)}%` }}
                />
              </div>
              <span className="font-mono text-xs text-zinc-500">
                {b.count.toLocaleString()} · {b.pct}%
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-6">
        <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-500">Supply state</h2>
        <div className="mt-4 flex h-8 rounded-full overflow-hidden">
          <div className="bg-amber-400" style={{ width: `${story.supply.circulating}%` }} />
          <div className="bg-rose-500" style={{ width: `${story.supply.burned}%` }} />
          <div className="bg-zinc-600" style={{ width: `${story.supply.locked}%` }} />
        </div>
        <div className="mt-3 flex gap-5 text-xs font-mono flex-wrap">
          <span className="flex items-center gap-2 text-zinc-300">
            <span className="h-2 w-2 rounded-full bg-amber-400" /> {story.supply.circulating}%
            circulating
          </span>
          <span className="flex items-center gap-2 text-zinc-300">
            <span className="h-2 w-2 rounded-full bg-rose-500" /> {story.supply.burned}% burned
          </span>
          <span className="flex items-center gap-2 text-zinc-300">
            <span className="h-2 w-2 rounded-full bg-zinc-600" /> {story.supply.locked}% locked
          </span>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-8">
        <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-500">Milestones</h2>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-5 gap-3">
          {story.milestones.map((m) => (
            <div key={m.date} className="border border-white/10 rounded p-3 bg-white/2">
              <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                {m.date}
              </div>
              <div className="mt-1 text-sm text-white">{m.event}</div>
              {m.pctChange && (
                <div className="mt-2 font-mono text-xs text-amber-300">{m.pctChange}</div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-lg text-zinc-300 italic">{story.community}</p>
        <div className="mt-6 border-l-2 border-amber-400 pl-4">
          <p className="font-mono text-xs uppercase tracking-wider text-amber-300/80">Verdict</p>
          <p className="mt-2 text-xl text-white">{story.verdict}</p>
        </div>
      </section>

      <div className="border-t border-white/10">
        <div className="mx-auto max-w-3xl px-6">
          <ShareRow theme="dark" price="0.30 USDC" />
        </div>
      </div>
      <div className="pb-28 text-center text-xs text-white/30 font-mono">
        chainbard · token saga · {story.input.slice(0, 12)}…
      </div>
    </div>
  );
}
