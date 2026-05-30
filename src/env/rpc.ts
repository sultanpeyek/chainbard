const PUBLIC_MAINNET = 'https://api.mainnet-beta.solana.com';

/** Read RPC: `SOLANA_RPC_URL → SYNAPSE_RPC_URL → public mainnet`. */
export function resolveRpcUrl(primary?: string, fallback?: string): string {
  return primary?.trim() || fallback?.trim() || PUBLIC_MAINNET;
}

/**
 * Send RPC for the SAP memo + other generic agent broadcasts (NOT the x402
 * settlement). The memo is an audit write, so an explicit send override is fine
 * here: `SOLANA_SEND_RPC_URL → SOLANA_RPC_URL → public mainnet`.
 */
export function resolveSendRpcUrl(send?: string, solana?: string): string {
  return send?.trim() || solana?.trim() || PUBLIC_MAINNET;
}

/**
 * Settlement RPC for the x402 USDC transfers (agent → AceData) — the
 * bounty-measured execution. Synapse RPC MUST lead so every settlement lands
 * through Synapse ("x402 ... with Synapse RPC in execution"); it deliberately
 * ignores `SOLANA_SEND_RPC_URL` so a send override can't route settlements off
 * Synapse. Falls back to the read RPC only when Synapse is unset:
 * `SYNAPSE_RPC_URL → SOLANA_RPC_URL → public mainnet`.
 */
export function resolveSettleRpcUrl(synapse?: string, solana?: string): string {
  return synapse?.trim() || solana?.trim() || PUBLIC_MAINNET;
}

/**
 * Host-only view of an RPC URL for safe logging — returns just `host[:port]`,
 * never the scheme, path, query, or userinfo. RPC providers embed API keys in the
 * query (`?api-key=…`) or path (`/<token>`), so logging the full URL leaks the
 * key; the host alone never does. Use this for ANY operator/console output that
 * wants to show which RPC is in use.
 */
export function rpcHost(url?: string): string {
  if (!url) return '(unset)';
  try {
    return new URL(url).host || '(invalid rpc url)';
  } catch {
    return '(invalid rpc url)';
  }
}
