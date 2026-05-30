/**
 * GET /api/agents/discover — weak SAP discovery surface.
 *
 * Returns every `AgentAccount` PDA on the SAP program. Intended for the
 * "agent capability network" sidebar (#19) and operator inspection.
 *
 * Read-only, public — no payment, no auth. Cached briefly to avoid hammering
 * the RPC if a UI polls. Errors surface as 502 so observability picks them up.
 */

import { Connection } from '@solana/web3.js';
import { type NextRequest, NextResponse } from 'next/server';
import { env, resolveRpcUrl } from '@/env';
import { discoverSapAgents, summarizeDiscovery } from '@/modules/sap-discovery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RPC_URL = resolveRpcUrl(env.SOLANA_RPC_URL, env.SYNAPSE_RPC_URL);

export async function GET(_req: NextRequest) {
  const connection = new Connection(RPC_URL, 'confirmed');
  try {
    const agents = await discoverSapAgents({ connection });
    const summary = summarizeDiscovery(agents);
    return NextResponse.json(
      {
        summary,
        count: agents.length,
        agents: agents.sort((a, b) => a.name.localeCompare(b.name)),
      },
      {
        headers: {
          'Cache-Control': 's-maxage=30, stale-while-revalidate=120',
        },
      },
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'sap-discovery failed', reason }, { status: 502 });
  }
}
