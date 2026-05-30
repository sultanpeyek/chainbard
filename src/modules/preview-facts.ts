/**
 * preview-facts — the free, pre-payment Preview fact set for the homepage hero.
 *
 * Given a pasted Solana input, detect its `kind` and return a few cheap on-chain
 * facts pulled from **free RPC only**. No Ace client is constructed or called
 * here (ADR 0006 — "Free Preview before payment … from free RPC only, no Ace
 * spend"). The free path is guaranteed by construction: `PreviewDeps` has no Ace
 * member to inject.
 */
import { detectKind } from '@/kind-detector';

/** A transaction's minimal preview shape. */
export interface PreviewTransaction {
  status: string;
  slot: number;
}

/** A DAS asset's minimal preview shape (extends the kind-detector AssetLookup result). */
export interface PreviewAsset {
  interface: string;
  supply?: number;
  name?: string;
}

/** An SPL mint's minimal supply/metadata preview shape. */
export interface PreviewTokenSupply {
  supply: number;
  name?: string;
}

/**
 * The boundary bundle the module injects. Every member is a free RPC lookup —
 * there is intentionally no Ace dependency here.
 */
export interface PreviewDeps {
  getOwner(pubkey: string): Promise<string | null>;
  getBalance(pubkey: string): Promise<number>;
  getTransactionCount(pubkey: string): Promise<number>;
  getTransaction(sig: string): Promise<PreviewTransaction | null>;
  getAsset(mint: string): Promise<PreviewAsset | null>;
  getTokenSupply(mint: string): Promise<PreviewTokenSupply | null>;
}

export interface PreviewFact {
  label: string;
  value: string;
}

export interface PreviewResult {
  kind: 'wallet' | 'tx' | 'nft' | 'token';
  facts: PreviewFact[];
}

export async function previewFacts(input: string, deps: PreviewDeps): Promise<PreviewResult> {
  const detected = await detectKind(input, deps, deps);

  switch (detected.kind) {
    case 'wallet': {
      const [balance, txCount] = await Promise.all([
        deps.getBalance(detected.pubkey),
        deps.getTransactionCount(detected.pubkey),
      ]);
      return {
        kind: 'wallet',
        facts: [
          { label: 'SOL balance', value: String(balance) },
          { label: 'Transactions', value: String(txCount) },
        ],
      };
    }
    case 'tx': {
      const tx = await deps.getTransaction(detected.sig);
      return {
        kind: 'tx',
        facts: [
          { label: 'Status', value: tx ? tx.status : 'not found' },
          { label: 'Slot', value: tx ? String(tx.slot) : '—' },
        ],
      };
    }
    case 'nft': {
      const asset = await deps.getAsset(detected.mint);
      return {
        kind: 'nft',
        facts: [{ label: 'Asset', value: asset?.name ?? 'Unnamed asset' }],
      };
    }
    case 'token': {
      const supply = await deps.getTokenSupply(detected.mint);
      return {
        kind: 'token',
        facts: [
          { label: 'Supply', value: supply ? String(supply.supply) : '—' },
          { label: 'Name', value: supply?.name ?? 'Unnamed token' },
        ],
      };
    }
  }
}
