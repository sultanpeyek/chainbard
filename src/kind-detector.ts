import bs58 from 'bs58';

export interface AccountOwnerLookup {
  getOwner(pubkey: string): Promise<string | null>;
}

export interface AssetLookup {
  getAsset(mint: string): Promise<{ interface: string; supply?: number; name?: string } | null>;
}

export type KindResult =
  | { kind: 'wallet'; pubkey: string }
  | { kind: 'nft'; mint: string }
  | { kind: 'tx'; sig: string }
  | { kind: 'token'; mint: string };

const SYSTEM_PROGRAM = '11111111111111111111111111111111';
const TOKEN_PROGRAMS = new Set<string>([
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
]);

// Recognised DAS interface strings that indicate a digital asset (NFT / cNFT).
const NFT_INTERFACES = new Set<string>([
  'V1_NFT',
  'V1_PRINT',
  'LEGACY_NFT',
  'ProgrammableNFT',
  'MplCoreAsset',
  'MplCoreCollection',
]);

function decode(input: string): Uint8Array {
  try {
    return bs58.decode(input);
  } catch {
    throw new Error(`Invalid input: not valid base58 (${input.slice(0, 12)})`);
  }
}

/**
 * Detect whether a raw input string is a wallet pubkey, an SPL token mint,
 * or a cNFT/NFT asset id.
 *
 * Owner-program discrimination:
 *   - Token / Token-2022 owned  → token kind (SPL fungible mint)
 *   - System Program owned      → wallet (no DAS call needed)
 *   - null (no on-chain account) → cNFT candidate; confirmed by DAS asset lookup
 *                                  when `assetLookup` is provided; falls back to
 *                                  wallet when `assetLookup` is omitted or returns null.
 */
export async function detectKind(
  input: string,
  rpc: AccountOwnerLookup,
  assetLookup?: AssetLookup,
): Promise<KindResult> {
  const bytes = decode(input);
  if (bytes.length === 64) {
    return { kind: 'tx', sig: input };
  }
  if (bytes.length !== 32) {
    throw new Error(`Invalid input: expected a 32-byte pubkey, got ${bytes.length} bytes`);
  }

  const owner = await rpc.getOwner(input);

  if (owner !== null && TOKEN_PROGRAMS.has(owner)) {
    // DAS-confirm: Metaplex NFTs are token-program-owned but carry an NFT
    // interface. Trust the DAS interface — supply==1 is not enough, since a
    // 1-of-1 fungible mint (supply 1, decimals 0) is still a FungibleToken.
    if (assetLookup !== undefined) {
      const asset = await assetLookup.getAsset(input);
      if (asset !== null && NFT_INTERFACES.has(asset.interface)) {
        return { kind: 'nft', mint: input };
      }
    }
    return { kind: 'token', mint: input };
  }

  // System-program-owned accounts are unambiguously wallets.
  if (owner === SYSTEM_PROGRAM) {
    return { kind: 'wallet', pubkey: input };
  }

  // Null-owned 32-byte pubkeys could be either an uninitialized wallet or a cNFT
  // asset ID (which has no on-chain account). Use DAS to discriminate when available.
  if (assetLookup !== undefined) {
    const asset = await assetLookup.getAsset(input);
    if (asset !== null && NFT_INTERFACES.has(asset.interface)) {
      return { kind: 'nft', mint: input };
    }
  }

  return { kind: 'wallet', pubkey: input };
}
