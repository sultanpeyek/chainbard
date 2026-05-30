// ── Tx spotlights ──────────────────────────────────────────────────────────

export interface TxRpcDetails {
  slot: number;
  blockTime: number | null;
  feeLamports: number;
  computeUnitsConsumed: number | null;
  accountKeys: string[];
  signerPubkey: string | null;
  /** Program IDs for each top-level instruction, in order. */
  ixProgramIds: string[];
  /** Indices of instructions that reverted (0-based). */
  revertedInstructionIndices: number[];
  balanceDeltas: { pubkey: string; preLamports: bigint; postLamports: bigint }[];
  err: unknown;
}

export interface TxSpotlightRpc {
  getTransactionDetails(sig: string): Promise<TxRpcDetails | null>;
}

export type TxSpotlights = {
  sig: string;
  slot: number;
  blockTime: number | null;
  feeLamports: number;
  computeUnitsConsumed: number | null;
  signerPubkey: string | null;
  accountKeys: string[];
  /** Deduplicated program IDs called in this tx. */
  programIds: string[];
  /** Program ID for each top-level instruction, in order. */
  ixProgramIds: string[];
  instructionCount: number;
  revertedInstructionIndices: number[];
  balanceDeltas: { pubkey: string; preLamports: bigint; postLamports: bigint }[];
  err: unknown;
  rpcCallsUsed: number;
};

export async function fetchTxSpotlights(sig: string, rpc: TxSpotlightRpc): Promise<TxSpotlights> {
  const details = await rpc.getTransactionDetails(sig);

  if (details === null) {
    return {
      sig,
      slot: 0,
      blockTime: null,
      feeLamports: 0,
      computeUnitsConsumed: null,
      signerPubkey: null,
      accountKeys: [],
      programIds: [],
      ixProgramIds: [],
      instructionCount: 0,
      revertedInstructionIndices: [],
      balanceDeltas: [],
      err: null,
      rpcCallsUsed: 1,
    };
  }

  const programIds = Array.from(new Set(details.ixProgramIds));

  return {
    sig,
    slot: details.slot,
    blockTime: details.blockTime,
    feeLamports: details.feeLamports,
    computeUnitsConsumed: details.computeUnitsConsumed,
    signerPubkey: details.signerPubkey,
    accountKeys: details.accountKeys,
    programIds,
    ixProgramIds: details.ixProgramIds,
    instructionCount: details.ixProgramIds.length,
    revertedInstructionIndices: details.revertedInstructionIndices,
    balanceDeltas: details.balanceDeltas,
    err: details.err,
    rpcCallsUsed: 1,
  };
}

// ── Token spotlights ────────────────────────────────────────────────────────

export interface TokenMintInfo {
  decimals: number;
  supplyRaw: bigint;
  mintRenounced: boolean;
  freezeRenounced: boolean;
}

export interface TokenAssetInfo {
  ticker: string | null;
  name: string | null;
  spotPriceUsd: number | null;
  /** Dexscreener market layer (nullable; sources that omit them default to null). */
  liquidityUsd?: number | null;
  volume24h?: number | null;
  priceChange24h?: number | null;
  imageUri?: string | null;
}

export interface TokenSpotlightSource {
  /** SPL mint account: decimals, raw supply, and renounced flags (authority === null). */
  getMintInfo(mint: string): Promise<TokenMintInfo>;
  /** DAS getAsset fungible extension: symbol/name + price_info.price_per_token (USD). Best-effort. */
  getAssetInfo(mint: string): Promise<TokenAssetInfo>;
  /** Unix seconds of the oldest observed signature (launch proxy). null when unknown. Best-effort. */
  getLaunchedAt(mint: string): Promise<number | null>;
}

export type TokenSpotlights = {
  mint: string;
  ticker: string | null;
  name: string | null;
  decimals: number;
  supplyRaw: bigint;
  supplyUiString: string;
  mintRenounced: boolean;
  freezeRenounced: boolean;
  launchedAt: number | null;
  spotPriceUsd: number | null;
  mcapDisplay: string | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  priceChange24h: number | null;
  imageUri: string | null;
  sourceCallsUsed: number;
};

/** USD market cap = spotPriceUsd × (supplyRaw / 10^decimals). null when price unknown. */
function computeMcapDisplay(
  spotPriceUsd: number | null,
  supplyRaw: bigint,
  decimals: number,
): string | null {
  if (spotPriceUsd === null) return null;
  const supplyUi = Number(supplyRaw) / 10 ** decimals;
  const mcap = spotPriceUsd * supplyUi;
  if (!Number.isFinite(mcap)) return null;
  if (mcap >= 1e9) return `$${(mcap / 1e9).toFixed(2)}B`;
  if (mcap >= 1e6) return `$${(mcap / 1e6).toFixed(2)}M`;
  if (mcap >= 1e3) return `$${(mcap / 1e3).toFixed(2)}K`;
  return `$${mcap.toFixed(2)}`;
}

/** UI supply string = supplyRaw / 10^decimals, locale-grouped, no fractional digits. */
function formatSupplyUi(supplyRaw: bigint, decimals: number): string {
  const ui = Number(supplyRaw) / 10 ** decimals;
  return ui.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export async function fetchTokenSpotlights(
  mint: string,
  source: TokenSpotlightSource,
): Promise<TokenSpotlights> {
  let calls = 0;
  const track = <T>(p: Promise<T>) => {
    calls += 1;
    return p;
  };

  const [mintInfo, assetInfo, launchedAt] = await Promise.all([
    track(source.getMintInfo(mint)),
    track(source.getAssetInfo(mint)),
    track(source.getLaunchedAt(mint)),
  ]);

  return {
    mint,
    ticker: assetInfo.ticker,
    name: assetInfo.name,
    decimals: mintInfo.decimals,
    supplyRaw: mintInfo.supplyRaw,
    supplyUiString: formatSupplyUi(mintInfo.supplyRaw, mintInfo.decimals),
    mintRenounced: mintInfo.mintRenounced,
    freezeRenounced: mintInfo.freezeRenounced,
    launchedAt,
    spotPriceUsd: assetInfo.spotPriceUsd,
    mcapDisplay: computeMcapDisplay(assetInfo.spotPriceUsd, mintInfo.supplyRaw, mintInfo.decimals),
    liquidityUsd: assetInfo.liquidityUsd ?? null,
    volume24h: assetInfo.volume24h ?? null,
    priceChange24h: assetInfo.priceChange24h ?? null,
    imageUri: assetInfo.imageUri ?? null,
    sourceCallsUsed: calls,
  };
}

// ── Wallet spotlights ───────────────────────────────────────────────────────

export interface SpotlightSigInfo {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: unknown;
}

export interface SpotlightTxInfo {
  accountKeys: string[];
  ixCount: number;
  feeLamports: number;
  blockTime: number | null;
  err: unknown;
}

export interface SpotlightRpc {
  getBalance(pubkey: string): Promise<bigint>;
  getSignaturesForAddress(pubkey: string, opts: { limit: number }): Promise<SpotlightSigInfo[]>;
  getTransaction(signature: string): Promise<SpotlightTxInfo | null>;
  getTokenAccountsByOwner(pubkey: string): Promise<{ count: number }>;
  getAssetsByOwner(pubkey: string): Promise<{ count: number }>;
}

export type WalletSpotlights = {
  pubkey: string;
  balanceLamports: bigint;
  txCountSampled: number;
  firstSeen: { signature: string; slot: number; blockTime: number | null } | null;
  latestActivityBlockTime: number | null;
  topCounterparties: string[];
  peakTx: {
    signature: string;
    ixCount: number;
    feeLamports: number;
    blockTime: number | null;
  } | null;
  failedTxSample: { signature: string; blockTime: number | null } | null;
  tokenAccountsCount: number;
  nftCount: number;
  rpcCallsUsed: number;
};

const SIG_LIMIT = 50;
const NFT_SIG_LIMIT = 20;
const NFT_TX_BUDGET = 3;
const TX_SAMPLE_BUDGET = 10;
const TOP_COUNTERPARTIES = 3;
const SYSTEM_PROGRAM = '11111111111111111111111111111111';

function pickSamples(sigs: SpotlightSigInfo[]): SpotlightSigInfo[] {
  if (sigs.length === 0) return [];
  const sorted = [...sigs].sort((a, b) => a.slot - b.slot);
  const oldest = sorted[0];
  const newest = sorted[sorted.length - 1];
  const failed = sigs.find((s) => s.err !== null);
  const picks = new Map<string, SpotlightSigInfo>();
  picks.set(oldest.signature, oldest);
  picks.set(newest.signature, newest);
  if (failed) picks.set(failed.signature, failed);
  const step = Math.max(1, Math.floor(sorted.length / TX_SAMPLE_BUDGET));
  for (let i = 0; i < sorted.length && picks.size < TX_SAMPLE_BUDGET; i += step) {
    const s = sorted[i];
    picks.set(s.signature, s);
  }
  return Array.from(picks.values()).slice(0, TX_SAMPLE_BUDGET);
}

export async function fetchWalletSpotlights(
  pubkey: string,
  rpc: SpotlightRpc,
): Promise<WalletSpotlights> {
  let calls = 0;
  const track = <T>(p: Promise<T>) => {
    calls += 1;
    return p;
  };

  const [balanceLamports, signatures] = await Promise.all([
    track(rpc.getBalance(pubkey)),
    track(rpc.getSignaturesForAddress(pubkey, { limit: SIG_LIMIT })),
  ]);

  const sorted = [...signatures].sort((a, b) => a.slot - b.slot);
  const firstSeen =
    sorted.length > 0
      ? {
          signature: sorted[0].signature,
          slot: sorted[0].slot,
          blockTime: sorted[0].blockTime,
        }
      : null;
  const latestActivityBlockTime = sorted.length > 0 ? sorted[sorted.length - 1].blockTime : null;

  const samples = pickSamples(signatures);
  const txs = await Promise.all(samples.map((s) => track(rpc.getTransaction(s.signature))));

  const counterpartyCounts = new Map<string, number>();
  let peakTx: WalletSpotlights['peakTx'] = null;
  let failedTxSample: WalletSpotlights['failedTxSample'] = null;

  for (let i = 0; i < txs.length; i += 1) {
    const t = txs[i];
    const s = samples[i];
    if (t === null) continue;
    for (const key of t.accountKeys) {
      if (key === pubkey || key === SYSTEM_PROGRAM) continue;
      counterpartyCounts.set(key, (counterpartyCounts.get(key) ?? 0) + 1);
    }
    if (peakTx === null || t.ixCount > peakTx.ixCount) {
      peakTx = {
        signature: s.signature,
        ixCount: t.ixCount,
        feeLamports: t.feeLamports,
        blockTime: t.blockTime,
      };
    }
    if (failedTxSample === null && t.err !== null) {
      failedTxSample = { signature: s.signature, blockTime: t.blockTime };
    }
  }

  const topCounterparties = Array.from(counterpartyCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_COUNTERPARTIES)
    .map(([k]) => k);

  const [{ count: tokenAccountsCount }, { count: nftCount }] = await Promise.all([
    track(rpc.getTokenAccountsByOwner(pubkey)),
    track(rpc.getAssetsByOwner(pubkey)),
  ]);

  return {
    pubkey,
    balanceLamports,
    txCountSampled: signatures.length,
    firstSeen,
    latestActivityBlockTime,
    topCounterparties,
    peakTx,
    failedTxSample,
    tokenAccountsCount,
    nftCount,
    rpcCallsUsed: calls,
  };
}

// ─── NFT / cNFT spotlight ───────────────────────────────────────────────────

/** Minimal subset of the Metaplex DAS `getAsset` response used by the pipeline. */
export interface DasAssetInfo {
  name: string;
  collectionName: string | null;
  collectionKey: string | null;
  interface: string;
  attributes: { trait_type: string; value: string }[];
  imageUri: string | null;
  currentOwner: string;
}

export interface NftSpotlightRpc {
  getAsset(mint: string): Promise<DasAssetInfo | null>;
  getSignaturesForAddress(address: string, opts: { limit: number }): Promise<SpotlightSigInfo[]>;
  getTransaction(signature: string): Promise<SpotlightTxInfo | null>;
}

export type ProvenanceEntry = {
  signature: string;
  blockTime: number | null;
  slot: number;
  acquired: 'mint' | 'buy' | 'transfer' | 'recovery';
  counterparty: string | null;
};

export type NftSpotlights = {
  mint: string;
  name: string;
  collectionName: string | null;
  traits: { label: string; value: string }[];
  currentOwner: string;
  imageUri: string | null;
  provenance: ProvenanceEntry[];
  rpcCallsUsed: number;
};

function inferAcquired(sig: SpotlightSigInfo, isFirst: boolean): ProvenanceEntry['acquired'] {
  if (isFirst) return 'mint';
  if (sig.err !== null) return 'recovery';
  return 'transfer';
}

/**
 * Fetch NFT spotlights for a cNFT mint address within a ~5 RPC call budget:
 *   1 getAsset (DAS) + 1 getSignaturesForAddress + up to 3 getTransaction calls.
 */
export async function fetchNftSpotlights(
  mint: string,
  rpc: NftSpotlightRpc,
): Promise<NftSpotlights> {
  let calls = 0;
  const track = <T>(p: Promise<T>) => {
    calls += 1;
    return p;
  };

  const [asset, signatures] = await Promise.all([
    track(rpc.getAsset(mint)),
    track(rpc.getSignaturesForAddress(mint, { limit: NFT_SIG_LIMIT })),
  ]);

  if (asset === null) {
    throw new Error(`NFT not found: no DAS asset for mint ${mint.slice(0, 12)}`);
  }

  const sorted = [...signatures].sort((a, b) => a.slot - b.slot);
  const sample = sorted.slice(0, NFT_TX_BUDGET);
  const txs = await Promise.all(sample.map((s) => track(rpc.getTransaction(s.signature))));

  const provenance: ProvenanceEntry[] = sample
    .map((s, i) => {
      const tx = txs[i];
      if (tx === null) return null;
      const counterparty =
        tx.accountKeys.find((k) => k !== mint && k !== asset.currentOwner) ?? null;
      return {
        signature: s.signature,
        blockTime: s.blockTime,
        slot: s.slot,
        acquired: inferAcquired(s, i === 0),
        counterparty,
      };
    })
    .filter((e): e is ProvenanceEntry => e !== null);

  return {
    mint,
    name: asset.name,
    collectionName: asset.collectionName,
    traits: asset.attributes.map((a) => ({ label: a.trait_type, value: String(a.value) })),
    currentOwner: asset.currentOwner,
    imageUri: asset.imageUri,
    provenance,
    rpcCallsUsed: calls,
  };
}
