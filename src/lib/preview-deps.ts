/**
 * preview-deps — server-side construction of the free Preview boundary bundle
 * (ADR 0006). Detection (getOwner / getAsset) reuses makeKindRpc; the remaining
 * cheap facts come from plain JSON-RPC against the same free endpoint. There is
 * intentionally no Ace dependency — `PreviewDeps` has no member to inject one,
 * so the free path is guaranteed by construction (no Ace spend before payment).
 *
 * Server-only: reads SYNAPSE_RPC_URL / SOLANA_RPC_URL. Used by the homepage
 * Preview route handler and by the `/[input]` paywall surface.
 */
import { env, resolveRpcUrl } from '@/env';
import { makeKindRpc } from '@/kind-rpc';
import type { PreviewDeps } from '@/modules/preview-facts';

const LAMPORTS_PER_SOL = 1_000_000_000;

async function jsonRpc(url: string, method: string, params: unknown[]): Promise<unknown> {
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

export function makePreviewDeps(): PreviewDeps {
  const { rpc, assetLookup } = makeKindRpc();
  // Plain JSON-RPC facts and DAS (getOwner/getAsset) both prefer SOLANA_RPC_URL
  // first, then fall back to Synapse: Synapse stays fallback-only because it is
  // flaky for plain reads. (DAS still works on a DAS-capable SOLANA_RPC_URL.)
  const rpcUrl = resolveRpcUrl(env.SOLANA_RPC_URL, env.SYNAPSE_RPC_URL);

  return {
    getOwner: (pubkey) => rpc.getOwner(pubkey),
    getAsset: async (mint) => {
      const asset = await assetLookup?.getAsset(mint);
      return asset ? { interface: asset.interface, supply: asset.supply, name: asset.name } : null;
    },
    async getBalance(pubkey) {
      if (!rpcUrl) return 0;
      const lamports = (await jsonRpc(rpcUrl, 'getBalance', [pubkey])) as {
        value?: number;
      } | null;
      return (lamports?.value ?? 0) / LAMPORTS_PER_SOL;
    },
    async getTransactionCount(pubkey) {
      if (!rpcUrl) return 0;
      const sigs = (await jsonRpc(rpcUrl, 'getSignaturesForAddress', [pubkey, { limit: 1000 }])) as
        | unknown[]
        | null;
      return Array.isArray(sigs) ? sigs.length : 0;
    },
    async getTransaction(sig) {
      if (!rpcUrl) return null;
      const tx = (await jsonRpc(rpcUrl, 'getTransaction', [
        sig,
        { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
      ])) as { slot: number; meta?: { err?: unknown } } | null;
      if (!tx) return null;
      return { status: tx.meta?.err ? 'failed' : 'success', slot: tx.slot };
    },
    async getTokenSupply(mint) {
      if (!rpcUrl) return null;
      // Supply comes from getTokenSupply; the human-readable name (when the mint
      // has on-chain metadata) comes from the DAS getAsset lookup in parallel.
      const [supply, asset] = await Promise.all([
        jsonRpc(rpcUrl, 'getTokenSupply', [mint]) as Promise<{
          value?: { uiAmount?: number | null; amount?: string };
        } | null>,
        assetLookup?.getAsset(mint) ?? Promise.resolve(null),
      ]);
      const value = supply?.value;
      if (!value) return null;
      return { supply: value.uiAmount ?? Number(value.amount ?? 0), name: asset?.name };
    },
  };
}
