import { describe, expect, test } from "bun:test";
import bs58 from "bs58";
import { type AccountOwnerLookup, type AssetLookup, detectKind } from "@/kind-detector";

const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const SPL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const BUBBLEGUM_PROGRAM = "BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY";

const WALLET_FIXTURE = "B1aLAAe4vW8nSQCetXnYqJfRxzTjnbooasVZjUUtsKf";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const BONK_MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
// A valid 32-byte base58 pubkey used as NFT fixture (same length as wallet)
const NFT_MINT = "BzG3LcMaskBearer4267xKqPnRvSwTzAa9BCdEfGhJk";

function stubAssetLookup(
  result: { interface: string; supply?: number; name?: string } | null,
): AssetLookup {
  return {
    async getAsset(_mint) {
      return result;
    },
  };
}

// 64-byte base58 → kind-detector must return tx
const TX_SIG_FIXTURE = bs58.encode(new Uint8Array(64).fill(1));

function stubLookup(map: Record<string, string | null>): AccountOwnerLookup {
  return {
    async getOwner(pubkey) {
      return map[pubkey] ?? null;
    },
  };
}

describe("detectKind — wallet branch", () => {
  test("classifies a System-Program-owned account as wallet", async () => {
    const rpc = stubLookup({ [WALLET_FIXTURE]: SYSTEM_PROGRAM });
    const result = await detectKind(WALLET_FIXTURE, rpc);
    expect(result).toEqual({ kind: "wallet", pubkey: WALLET_FIXTURE });
  });

  test("classifies an uninitialized base58 pubkey as wallet", async () => {
    const rpc = stubLookup({ [WALLET_FIXTURE]: null });
    const result = await detectKind(WALLET_FIXTURE, rpc);
    expect(result).toEqual({ kind: "wallet", pubkey: WALLET_FIXTURE });
  });

  test("throws on input that is not valid base58 pubkey length", async () => {
    const rpc = stubLookup({});
    expect(detectKind("nope", rpc)).rejects.toThrow(/invalid input/i);
  });
});

describe("detectKind — tx branch", () => {
  test("returns tx kind for a 64-byte base58 input without RPC call", async () => {
    const rpc = stubLookup({});
    const result = await detectKind(TX_SIG_FIXTURE, rpc);
    expect(result).toEqual({ kind: "tx", sig: TX_SIG_FIXTURE });
  });

  test("returns tx kind and does not call RPC", async () => {
    let rpcCalled = false;
    const rpc: AccountOwnerLookup = {
      async getOwner() {
        rpcCalled = true;
        return null;
      },
    };
    await detectKind(TX_SIG_FIXTURE, rpc);
    expect(rpcCalled).toBe(false);
  });

  test("discriminates tx sig from 32-byte wallet pubkey", async () => {
    const walletRpc = stubLookup({ [WALLET_FIXTURE]: null });
    const walletResult = await detectKind(WALLET_FIXTURE, walletRpc);
    expect(walletResult.kind).toBe("wallet");

    const txRpc = stubLookup({});
    const txResult = await detectKind(TX_SIG_FIXTURE, txRpc);
    expect(txResult.kind).toBe("tx");
  });
});

describe("detectKind — NFT branch", () => {
  test("classifies null-owner mint as nft when DAS returns V1_NFT interface", async () => {
    const rpc = stubLookup({ [NFT_MINT]: null });
    const result = await detectKind(NFT_MINT, rpc, stubAssetLookup({ interface: "V1_NFT" }));
    expect(result).toEqual({ kind: "nft", mint: NFT_MINT });
  });

  test("classifies null-owner mint as nft for ProgrammableNFT interface", async () => {
    const rpc = stubLookup({ [NFT_MINT]: null });
    const result = await detectKind(
      NFT_MINT,
      rpc,
      stubAssetLookup({ interface: "ProgrammableNFT" }),
    );
    expect(result).toEqual({ kind: "nft", mint: NFT_MINT });
  });

  test("classifies null-owner pubkey as wallet when DAS returns null", async () => {
    const rpc = stubLookup({ [WALLET_FIXTURE]: null });
    const result = await detectKind(WALLET_FIXTURE, rpc, stubAssetLookup(null));
    expect(result).toEqual({ kind: "wallet", pubkey: WALLET_FIXTURE });
  });

  test("classifies null-owner pubkey as wallet when DAS returns unknown interface", async () => {
    const rpc = stubLookup({ [WALLET_FIXTURE]: null });
    const result = await detectKind(
      WALLET_FIXTURE,
      rpc,
      stubAssetLookup({ interface: "FungibleToken" }),
    );
    expect(result).toEqual({ kind: "wallet", pubkey: WALLET_FIXTURE });
  });

  test("skips DAS call for System-Program-owned accounts", async () => {
    const rpc = stubLookup({ [WALLET_FIXTURE]: SYSTEM_PROGRAM });
    let called = false;
    const assetLookup: AssetLookup = {
      async getAsset() {
        called = true;
        return null;
      },
    };
    const result = await detectKind(WALLET_FIXTURE, rpc, assetLookup);
    expect(result.kind).toBe("wallet");
    expect(called).toBe(false);
  });
});

describe("detectKind — token branch", () => {
  test("classifies a Token-Program-owned mint as token kind", async () => {
    const rpc = stubLookup({ [USDC_MINT]: SPL_TOKEN_PROGRAM });
    const result = await detectKind(USDC_MINT, rpc);
    expect(result).toEqual({ kind: "token", mint: USDC_MINT });
  });

  test("classifies a Token-2022-owned mint as token kind", async () => {
    const rpc = stubLookup({ [BONK_MINT]: TOKEN_2022_PROGRAM });
    const result = await detectKind(BONK_MINT, rpc);
    expect(result).toEqual({ kind: "token", mint: BONK_MINT });
  });

  // DAS-confirm: token-program-owned + NFT interface → nft (Metaplex NFTs are token-owned)
  test("token-program-owned mint with NFT interface classifies as nft (DAS-confirm)", async () => {
    const rpc = stubLookup({ [NFT_MINT]: SPL_TOKEN_PROGRAM });
    const result = await detectKind(
      NFT_MINT,
      rpc,
      stubAssetLookup({ interface: "V1_NFT" }),
    );
    expect(result).toEqual({ kind: "nft", mint: NFT_MINT });
  });

  test("token-program-owned mint with NFT interface classifies as nft (ProgrammableNFT)", async () => {
    const rpc = stubLookup({ [NFT_MINT]: SPL_TOKEN_PROGRAM });
    const result = await detectKind(
      NFT_MINT,
      rpc,
      stubAssetLookup({ interface: "ProgrammableNFT" }),
    );
    expect(result).toEqual({ kind: "nft", mint: NFT_MINT });
  });

  test("token-program-owned fungible mint with supply==1 classifies as token (1-of-1 fungible)", async () => {
    // A FungibleToken with supply 1 / decimals 0 is still a token, not an NFT —
    // classification gates on the DAS interface, not supply.
    const rpc = stubLookup({ [USDC_MINT]: SPL_TOKEN_PROGRAM });
    const result = await detectKind(
      USDC_MINT,
      rpc,
      stubAssetLookup({ interface: "FungibleToken", supply: 1 }),
    );
    expect(result).toEqual({ kind: "token", mint: USDC_MINT });
  });

  test("token-program-owned fungible (large supply, no NFT interface) classifies as token", async () => {
    // USDC: token-owned, large supply, no NFT interface
    const rpc = stubLookup({ [USDC_MINT]: SPL_TOKEN_PROGRAM });
    const result = await detectKind(
      USDC_MINT,
      rpc,
      stubAssetLookup({ interface: "FungibleToken", supply: 1_000_000_000 }),
    );
    expect(result).toEqual({ kind: "token", mint: USDC_MINT });
  });

  test("token-program-owned in degraded mode (no assetLookup) falls back to token", async () => {
    const rpc = stubLookup({ [USDC_MINT]: SPL_TOKEN_PROGRAM });
    const result = await detectKind(USDC_MINT, rpc);
    expect(result).toEqual({ kind: "token", mint: USDC_MINT });
  });

  test("does NOT classify a cNFT asset-id (Bubblegum owner) as token", async () => {
    const rpc = stubLookup({ [USDC_MINT]: BUBBLEGUM_PROGRAM });
    const result = await detectKind(USDC_MINT, rpc);
    expect(result.kind).not.toBe("token");
  });

  test("does NOT classify a null-owner address (wallet or cNFT asset-id) as token", async () => {
    const rpc = stubLookup({ [WALLET_FIXTURE]: null });
    const result = await detectKind(WALLET_FIXTURE, rpc);
    expect(result.kind).not.toBe("token");
  });
});
