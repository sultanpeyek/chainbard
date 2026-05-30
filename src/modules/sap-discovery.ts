/**
 * Weak SAP discovery — enumerates every `AgentAccount` PDA on the SAP program
 * via `getProgramAccounts`. "Weak" because it is read-only and untrusted: it
 * mirrors what any chain observer would see, with no reputation overlay.
 *
 * Used to:
 *   - surface the live SAP capability network on operator-facing logs
 *   - power a future "agent capability network" UI sidebar (see #19)
 *
 * Uses the inline-IDL pattern (`Program.fetchIdl` + Anchor coder) because the
 * SDK 0.18.1 bundled IDL drifts from deployed v0.18. The fetched on-chain IDL
 * is the source of truth for the AgentAccount layout.
 */

import { AnchorProvider, Program, type Wallet } from '@coral-xyz/anchor';
import { PROGRAM_ID } from '@oobe-protocol-labs/synapse-sap-sdk';
import { type Connection, PublicKey } from '@solana/web3.js';

export interface DiscoveredAgent {
  pda: string;
  wallet: string;
  name: string;
  isActive: boolean;
  x402Endpoint: string | null;
  capabilities: string[];
}

export interface SapDiscoveryDeps {
  connection: Connection;
}

const READONLY_WALLET: Wallet = {
  publicKey: PublicKey.default,
  async signTransaction() {
    throw new Error('sap-discovery: read-only wallet cannot sign');
  },
  async signAllTransactions() {
    throw new Error('sap-discovery: read-only wallet cannot sign');
  },
  payer: undefined as never,
};

export async function discoverSapAgents(deps: SapDiscoveryDeps): Promise<DiscoveredAgent[]> {
  const programId = new PublicKey(PROGRAM_ID);
  const provider = new AnchorProvider(deps.connection, READONLY_WALLET, {
    commitment: 'confirmed',
  });
  const idl = await Program.fetchIdl(programId, provider);
  if (!idl) {
    throw new Error(`sap-discovery: no IDL published for ${programId.toBase58()}`);
  }
  const program = new Program(idl, provider);
  // AccountNamespace<Idl> is loosely typed; we know `agentAccount` exists
  // because the on-chain IDL declares it (see SDK `synapse_agent_sap.json`).
  const accountNs = program.account as unknown as {
    agentAccount: {
      all(): Promise<Array<{ publicKey: PublicKey; account: unknown }>>;
    };
  };
  const accounts = await accountNs.agentAccount.all();

  return accounts.map((entry): DiscoveredAgent => {
    const acct = entry.account as {
      wallet: PublicKey;
      name: string;
      isActive: boolean;
      x402Endpoint: string | null | undefined;
      capabilities: Array<{ id?: string } | string> | undefined;
    };
    return {
      pda: entry.publicKey.toBase58(),
      wallet: acct.wallet.toBase58(),
      name: acct.name,
      isActive: acct.isActive,
      x402Endpoint: acct.x402Endpoint ?? null,
      capabilities: (acct.capabilities ?? [])
        .map((c) => (typeof c === 'string' ? c : (c.id ?? '')))
        .filter((s) => s.length > 0),
    };
  });
}

export function summarizeDiscovery(agents: DiscoveredAgent[]): string {
  const active = agents.filter((a) => a.isActive).length;
  const withEndpoint = agents.filter((a) => a.x402Endpoint).length;
  return `sap-discovery: ${agents.length} agents (${active} active, ${withEndpoint} w/ x402)`;
}
