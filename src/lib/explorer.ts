// Solana explorer links for on-chain proof. The agent operates on mainnet
// (see CONTEXT.md), so no cluster query param is needed. Matches the existing
// solscan convention used in wallet-share-page.tsx.

export function solscanTxUrl(sig: string): string {
  return `https://solscan.io/tx/${sig}`;
}

// One Solscan link per story kind. Wallets resolve to /account, txs to /tx, and
// both NFTs and tokens are SPL mints so they resolve to /token.
export type SolscanKind = 'wallet' | 'tx' | 'nft' | 'token';

const SOLSCAN_PATH: Record<SolscanKind, string> = {
  wallet: 'account',
  tx: 'tx',
  nft: 'token',
  token: 'token',
};

export function solscanUrl(value: string, kind: SolscanKind): string {
  return `https://solscan.io/${SOLSCAN_PATH[kind]}/${value}`;
}
