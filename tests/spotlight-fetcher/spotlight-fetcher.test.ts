import { describe, expect, test } from "bun:test";
import bs58 from "bs58";
import {
  fetchNftSpotlights,
  fetchTxSpotlights,
  fetchWalletSpotlights,
  type DasAssetInfo,
  type NftSpotlightRpc,
  type SpotlightRpc,
  type SpotlightSigInfo,
  type SpotlightTxInfo,
  type TxRpcDetails,
  type TxSpotlightRpc,
} from "@/spotlight-fetcher";

const WALLET = "B1aLAAe4vW8nSQCetXnYqJfRxzTjnbooasVZjUUtsKf";
const COUNTERPARTY_A = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const COUNTERPARTY_B = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const COUNTERPARTY_C = "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";
const SYSTEM_PROGRAM = "11111111111111111111111111111111";

type CallLog = { method: string; arg: string };

function makeRpc(opts: {
  balance?: bigint;
  signatures?: SpotlightSigInfo[];
  transactions?: Record<string, SpotlightTxInfo | null>;
  tokenAccountsCount?: number;
  nftCount?: number;
  log?: CallLog[];
}): SpotlightRpc {
  const log = opts.log ?? [];
  return {
    async getBalance(pubkey) {
      log.push({ method: "getBalance", arg: pubkey });
      return opts.balance ?? BigInt(0);
    },
    async getSignaturesForAddress(pubkey, _o) {
      log.push({ method: "getSignaturesForAddress", arg: pubkey });
      return opts.signatures ?? [];
    },
    async getTransaction(sig) {
      log.push({ method: "getTransaction", arg: sig });
      return opts.transactions?.[sig] ?? null;
    },
    async getTokenAccountsByOwner(pubkey) {
      log.push({ method: "getTokenAccountsByOwner", arg: pubkey });
      return { count: opts.tokenAccountsCount ?? 0 };
    },
    async getAssetsByOwner(pubkey) {
      log.push({ method: "getAssetsByOwner", arg: pubkey });
      return { count: opts.nftCount ?? 0 };
    },
  };
}

function sig(s: string, slot: number, blockTime: number, err: unknown = null): SpotlightSigInfo {
  return { signature: s, slot, blockTime, err };
}

function tx(
  accountKeys: string[],
  ixCount: number,
  feeLamports: number,
  blockTime: number,
  err: unknown = null,
): SpotlightTxInfo {
  return { accountKeys, ixCount, feeLamports, blockTime, err };
}

describe("fetchWalletSpotlights — wallet branch", () => {
  test("returns pubkey and balance for empty-history wallet", async () => {
    const rpc = makeRpc({ balance: BigInt(1_234_567) });
    const result = await fetchWalletSpotlights(WALLET, rpc);
    expect(result.pubkey).toBe(WALLET);
    expect(result.balanceLamports).toBe(BigInt(1_234_567));
    expect(result.txCountSampled).toBe(0);
    expect(result.firstSeen).toBeNull();
    expect(result.peakTx).toBeNull();
    expect(result.failedTxSample).toBeNull();
    expect(result.topCounterparties).toEqual([]);
  });

  test("extracts firstSeen from oldest signature in sample", async () => {
    const signatures = [
      sig("sigC", 300, 3000),
      sig("sigB", 200, 2000),
      sig("sigA", 100, 1000),
    ];
    const rpc = makeRpc({ signatures });
    const result = await fetchWalletSpotlights(WALLET, rpc);
    expect(result.firstSeen).toEqual({
      signature: "sigA",
      slot: 100,
      blockTime: 1000,
    });
    expect(result.latestActivityBlockTime).toBe(3000);
    expect(result.txCountSampled).toBe(3);
  });

  test("ranks top counterparties by frequency across sampled txs", async () => {
    const signatures = [sig("s1", 1, 10), sig("s2", 2, 20), sig("s3", 3, 30)];
    const transactions: Record<string, SpotlightTxInfo> = {
      s1: tx([WALLET, COUNTERPARTY_A, COUNTERPARTY_B, SYSTEM_PROGRAM], 2, 5000, 10),
      s2: tx([WALLET, COUNTERPARTY_A, COUNTERPARTY_C], 1, 5000, 20),
      s3: tx([WALLET, COUNTERPARTY_B], 1, 5000, 30),
    };
    const rpc = makeRpc({ signatures, transactions });
    const result = await fetchWalletSpotlights(WALLET, rpc);
    expect(result.topCounterparties.slice(0, 3)).toEqual([
      COUNTERPARTY_A,
      COUNTERPARTY_B,
      COUNTERPARTY_C,
    ]);
    expect(result.topCounterparties).not.toContain(WALLET);
    expect(result.topCounterparties).not.toContain(SYSTEM_PROGRAM);
  });

  test("identifies peakTx as the highest-ix-count sampled tx", async () => {
    const signatures = [sig("small", 1, 100), sig("big", 2, 200)];
    const transactions: Record<string, SpotlightTxInfo> = {
      small: tx([WALLET, COUNTERPARTY_A], 2, 5000, 100),
      big: tx([WALLET, COUNTERPARTY_B], 47, 41_000, 200),
    };
    const rpc = makeRpc({ signatures, transactions });
    const result = await fetchWalletSpotlights(WALLET, rpc);
    expect(result.peakTx).toEqual({
      signature: "big",
      ixCount: 47,
      feeLamports: 41_000,
      blockTime: 200,
    });
  });

  test("surfaces a failed-tx sample when present", async () => {
    const signatures = [
      sig("ok", 1, 100),
      sig("bad", 2, 200, { InstructionError: [0, "Custom"] }),
    ];
    const transactions: Record<string, SpotlightTxInfo> = {
      ok: tx([WALLET, COUNTERPARTY_A], 1, 5000, 100),
      bad: tx([WALLET, COUNTERPARTY_B], 1, 5000, 200, { InstructionError: [0, "Custom"] }),
    };
    const rpc = makeRpc({ signatures, transactions });
    const result = await fetchWalletSpotlights(WALLET, rpc);
    expect(result.failedTxSample).toEqual({
      signature: "bad",
      blockTime: 200,
    });
  });

  test("respects the ~15 RPC call budget", async () => {
    const signatures = Array.from({ length: 50 }, (_, i) =>
      sig(`s${i}`, i, 1000 + i),
    );
    const transactions: Record<string, SpotlightTxInfo> = Object.fromEntries(
      signatures.map((s) => [s.signature, tx([WALLET, COUNTERPARTY_A], 1, 5000, s.blockTime ?? 0)]),
    );
    const log: CallLog[] = [];
    const rpc = makeRpc({
      balance: BigInt(100),
      signatures,
      transactions,
      tokenAccountsCount: 5,
      nftCount: 3,
      log,
    });
    const result = await fetchWalletSpotlights(WALLET, rpc);
    expect(log.length).toBeLessThanOrEqual(15);
    expect(result.rpcCallsUsed).toBe(log.length);
    expect(result.tokenAccountsCount).toBe(5);
    expect(result.nftCount).toBe(3);
  });
});

// ─── fetchNftSpotlights ──────────────────────────────────────────────────────

const NFT_MINT = "BzG3LcMaskBearer4267xKqPnRvSwTzAa9BCdEfGhJk";
const OWNER = "OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO";

function makeAsset(overrides?: Partial<DasAssetInfo>): DasAssetInfo {
  return {
    name: "Mask Bearer #4267",
    collectionName: "Mask Bearers",
    collectionKey: "MaskBearersCollection111111111111111111111111",
    interface: "V1_NFT",
    attributes: [
      { trait_type: "Mask", value: "Crimson Hex" },
      { trait_type: "Robe", value: "Indigo Wave" },
    ],
    imageUri: "https://arweave.net/fake-image",
    currentOwner: OWNER,
    ...overrides,
  };
}

type NftCallLog = { method: string; arg: string };

function makeNftRpc(opts: {
  asset?: DasAssetInfo | null;
  signatures?: SpotlightSigInfo[];
  transactions?: Record<string, SpotlightTxInfo | null>;
  log?: NftCallLog[];
}): NftSpotlightRpc {
  const log = opts.log ?? [];
  return {
    async getAsset(mint) {
      log.push({ method: "getAsset", arg: mint });
      return opts.asset === undefined ? makeAsset() : opts.asset;
    },
    async getSignaturesForAddress(address, _opts) {
      log.push({ method: "getSignaturesForAddress", arg: address });
      return opts.signatures ?? [];
    },
    async getTransaction(s) {
      log.push({ method: "getTransaction", arg: s });
      return opts.transactions?.[s] ?? null;
    },
  };
}

// ── Tx spotlight tests ──────────────────────────────────────────────────────

const TX_SIG = bs58.encode(new Uint8Array(64).fill(1));

const JUPITER = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
const ORCA = "9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP";
const COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111";
const SIGNER = "GhE9vKp2aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function makeDetails(overrides?: Partial<TxRpcDetails>): TxRpcDetails {
  return {
    slot: 298441209,
    blockTime: 1739239632,
    feeLamports: 5000,
    computeUnitsConsumed: 200000,
    accountKeys: [SIGNER, JUPITER, ORCA],
    signerPubkey: SIGNER,
    ixProgramIds: [COMPUTE_BUDGET, JUPITER, ORCA, JUPITER],
    revertedInstructionIndices: [],
    balanceDeltas: [
      { pubkey: SIGNER, preLamports: BigInt(1000000000), postLamports: BigInt(1005000000) },
    ],
    err: null,
    ...overrides,
  };
}

function makeTxRpc(details: TxRpcDetails | null): TxSpotlightRpc {
  return {
    async getTransactionDetails(_sig) {
      return details;
    },
  };
}

describe("fetchNftSpotlights — NFT branch", () => {
  test("returns metadata from DAS asset response", async () => {
    const rpc = makeNftRpc({});
    const result = await fetchNftSpotlights(NFT_MINT, rpc);
    expect(result.mint).toBe(NFT_MINT);
    expect(result.name).toBe("Mask Bearer #4267");
    expect(result.collectionName).toBe("Mask Bearers");
    expect(result.currentOwner).toBe(OWNER);
    expect(result.imageUri).toBe("https://arweave.net/fake-image");
  });

  test("maps DAS attributes to traits label/value pairs", async () => {
    const rpc = makeNftRpc({});
    const result = await fetchNftSpotlights(NFT_MINT, rpc);
    expect(result.traits).toEqual([
      { label: "Mask", value: "Crimson Hex" },
      { label: "Robe", value: "Indigo Wave" },
    ]);
  });

  test("throws when DAS returns null (asset not found)", async () => {
    const rpc = makeNftRpc({ asset: null });
    await expect(fetchNftSpotlights(NFT_MINT, rpc)).rejects.toThrow(/NFT not found/i);
  });

  test("marks the oldest signature as mint acquisition", async () => {
    const sigs: SpotlightSigInfo[] = [
      sig("s1", 100, 1000),
      sig("s2", 200, 2000),
      sig("s3", 300, 3000),
    ];
    const txs: Record<string, SpotlightTxInfo> = {
      s1: tx([NFT_MINT, COUNTERPARTY_A, OWNER], 1, 5000, 1000),
      s2: tx([NFT_MINT, COUNTERPARTY_B, OWNER], 1, 5000, 2000),
      s3: tx([NFT_MINT, COUNTERPARTY_C, OWNER], 1, 5000, 3000),
    };
    const rpc = makeNftRpc({ signatures: sigs, transactions: txs });
    const result = await fetchNftSpotlights(NFT_MINT, rpc);
    expect(result.provenance[0].acquired).toBe("mint");
    expect(result.provenance[0].signature).toBe("s1");
  });

  test("marks failed-tx provenance entries as recovery", async () => {
    const sigs: SpotlightSigInfo[] = [
      sig("s1", 100, 1000),
      sig("s2", 200, 2000, { InstructionError: [0, "Custom"] }),
    ];
    const txs: Record<string, SpotlightTxInfo> = {
      s1: tx([NFT_MINT, COUNTERPARTY_A, OWNER], 1, 5000, 1000),
      s2: tx([NFT_MINT, COUNTERPARTY_B, OWNER], 1, 5000, 2000, { InstructionError: [0, "Custom"] }),
    };
    const rpc = makeNftRpc({ signatures: sigs, transactions: txs });
    const result = await fetchNftSpotlights(NFT_MINT, rpc);
    const recoveryEntry = result.provenance.find((p) => p.signature === "s2");
    expect(recoveryEntry?.acquired).toBe("recovery");
  });

  test("stays within the ~5 RPC call budget", async () => {
    const manySigs: SpotlightSigInfo[] = Array.from({ length: 20 }, (_, i) =>
      sig(`s${i}`, i, 1000 + i),
    );
    const txs: Record<string, SpotlightTxInfo> = Object.fromEntries(
      manySigs.map((s) => [s.signature, tx([NFT_MINT, OWNER], 1, 5000, s.blockTime ?? 0)]),
    );
    const log: NftCallLog[] = [];
    const rpc = makeNftRpc({ signatures: manySigs, transactions: txs, log });
    const result = await fetchNftSpotlights(NFT_MINT, rpc);
    expect(log.length).toBeLessThanOrEqual(5);
    expect(result.rpcCallsUsed).toBe(log.length);
  });

  test("handles empty signature history (freshly minted)", async () => {
    const rpc = makeNftRpc({ signatures: [] });
    const result = await fetchNftSpotlights(NFT_MINT, rpc);
    expect(result.provenance).toEqual([]);
    expect(result.name).toBe("Mask Bearer #4267");
  });

  test("sets collectionName to null when absent", async () => {
    const rpc = makeNftRpc({
      asset: makeAsset({ collectionName: null, collectionKey: null }),
    });
    const result = await fetchNftSpotlights(NFT_MINT, rpc);
    expect(result.collectionName).toBeNull();
  });
});

describe("fetchTxSpotlights — tx branch", () => {
  test("returns spotlights with sig, slot, blockTime, fee from RPC details", async () => {
    const rpc = makeTxRpc(makeDetails());
    const result = await fetchTxSpotlights(TX_SIG, rpc);
    expect(result.sig).toBe(TX_SIG);
    expect(result.slot).toBe(298441209);
    expect(result.blockTime).toBe(1739239632);
    expect(result.feeLamports).toBe(5000);
    expect(result.computeUnitsConsumed).toBe(200000);
  });

  test("deduplicates programIds from ixProgramIds", async () => {
    const rpc = makeTxRpc(makeDetails());
    const result = await fetchTxSpotlights(TX_SIG, rpc);
    // ixProgramIds: [COMPUTE_BUDGET, JUPITER, ORCA, JUPITER] → 3 unique
    expect(result.programIds).toHaveLength(3);
    expect(result.programIds).toContain(COMPUTE_BUDGET);
    expect(result.programIds).toContain(JUPITER);
    expect(result.programIds).toContain(ORCA);
  });

  test("instructionCount matches ixProgramIds length", async () => {
    const rpc = makeTxRpc(makeDetails());
    const result = await fetchTxSpotlights(TX_SIG, rpc);
    expect(result.instructionCount).toBe(4);
  });

  test("surfaces revertedInstructionIndices from RPC details", async () => {
    const rpc = makeTxRpc(makeDetails({ revertedInstructionIndices: [1, 3] }));
    const result = await fetchTxSpotlights(TX_SIG, rpc);
    expect(result.revertedInstructionIndices).toEqual([1, 3]);
  });

  test("returns empty spotlights when tx not found (null details)", async () => {
    const rpc = makeTxRpc(null);
    const result = await fetchTxSpotlights(TX_SIG, rpc);
    expect(result.sig).toBe(TX_SIG);
    expect(result.slot).toBe(0);
    expect(result.instructionCount).toBe(0);
    expect(result.programIds).toHaveLength(0);
    expect(result.err).toBeNull();
  });

  test("uses exactly 1 RPC call (within ~7 budget)", async () => {
    let callCount = 0;
    const rpc: TxSpotlightRpc = {
      async getTransactionDetails(_sig) {
        callCount += 1;
        return makeDetails();
      },
    };
    const result = await fetchTxSpotlights(TX_SIG, rpc);
    expect(callCount).toBe(1);
    expect(result.rpcCallsUsed).toBe(1);
    expect(result.rpcCallsUsed).toBeLessThanOrEqual(7);
  });

  test("preserves balance deltas from RPC details", async () => {
    const rpc = makeTxRpc(makeDetails());
    const result = await fetchTxSpotlights(TX_SIG, rpc);
    expect(result.balanceDeltas).toHaveLength(1);
    expect(result.balanceDeltas[0].pubkey).toBe(SIGNER);
    expect(result.balanceDeltas[0].preLamports).toBe(BigInt(1000000000));
    expect(result.balanceDeltas[0].postLamports).toBe(BigInt(1005000000));
  });

  test("surfaces failed-tx error from RPC details", async () => {
    const rpc = makeTxRpc(makeDetails({ err: { InstructionError: [2, "Custom"] } }));
    const result = await fetchTxSpotlights(TX_SIG, rpc);
    expect(result.err).not.toBeNull();
  });
});
