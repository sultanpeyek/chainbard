/**
 * kind-rpc — server-side backing for detectKind using plain JSON-RPC.
 *
 * getOwner: Solana getAccountInfo → account.owner (string | null).
 * getAsset: getAsset {id} → { interface, supply?, name? } (DAS extension required).
 *   Note: this endpoint has no `das_getAsset` method (returns Method not found).
 *
 * Both implement the AccountOwnerLookup / AssetLookup interfaces from kind-detector.ts.
 *
 * Factory: makeKindRpc()
 *   - Picks the DAS endpoint as `SOLANA_RPC_URL → SYNAPSE_RPC_URL` (SOLANA-first;
 *     Synapse is the DAS fallback). Returns { rpc, assetLookup } when either is set.
 *   - When neither is set: returns { rpc } with getOwner always returning null
 *     (graceful degrade, tx/wallet detection still works).
 *   - getAsset degrades to null on any RPC that lacks DAS, so a non-DAS
 *     SOLANA_RPC_URL still works (cNFT → wallet fallback, no crash).
 */

import { env } from '@/env';
import type { AccountOwnerLookup, AssetLookup } from './kind-detector';

async function jsonRpc(url: string, method: string, params: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC HTTP error ${res.status}`);
  const json = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(`RPC error: ${json.error.message}`);
  return json.result;
}

function makeOwnerLookup(rpcUrl: string): AccountOwnerLookup {
  return {
    async getOwner(pubkey: string): Promise<string | null> {
      const result = await jsonRpc(rpcUrl, 'getAccountInfo', [
        pubkey,
        { encoding: 'base64', commitment: 'confirmed' },
      ]);
      const info = result as { value?: { owner?: string } | null } | null;
      return info?.value?.owner ?? null;
    },
  };
}

function makeAssetLookup(rpcUrl: string): AssetLookup {
  return {
    async getAsset(
      mint: string,
    ): Promise<{ interface: string; supply?: number; name?: string } | null> {
      try {
        const result = await jsonRpc(rpcUrl, 'getAsset', { id: mint });
        const asset = result as {
          interface?: string;
          token_info?: { supply?: number };
          content?: { metadata?: { name?: string } };
        } | null;
        if (!asset?.interface) return null;
        return {
          interface: asset.interface,
          supply: asset.token_info?.supply,
          name: asset.content?.metadata?.name,
        };
      } catch {
        // DAS not available or asset not found — treat as null
        return null;
      }
    },
  };
}

/** Null-object owner lookup — always returns null (graceful degrade). */
const nullOwnerLookup: AccountOwnerLookup = {
  async getOwner() {
    return null;
  },
};

export interface KindRpcResult {
  rpc: AccountOwnerLookup;
  assetLookup?: AssetLookup;
}

/**
 * Build the kind-rpc backing. The DAS endpoint is `SOLANA_RPC_URL →
 * SYNAPSE_RPC_URL` (SOLANA-first; Synapse is the DAS fallback). getAsset
 * degrades to null on any endpoint without DAS, so a non-DAS SOLANA_RPC_URL
 * keeps getOwner working without crashing.
 */
export function makeKindRpc(): KindRpcResult {
  const dasUrl = env.SOLANA_RPC_URL?.trim() || env.SYNAPSE_RPC_URL?.trim();
  if (dasUrl) {
    return {
      rpc: makeOwnerLookup(dasUrl),
      assetLookup: makeAssetLookup(dasUrl),
    };
  }

  return { rpc: nullOwnerLookup };
}
