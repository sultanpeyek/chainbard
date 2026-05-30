/**
 * Vercel Cron endpoint — autonomous curator tick.
 *
 * Schedule: daily at 06:00 UTC (vercel.json).
 * Auth: Vercel sends `Authorization: Bearer <CRON_SECRET>` on every invocation.
 *       Requests missing or presenting a wrong secret are rejected with 401.
 *
 * Wiring:
 *   - Real adapters built via `createCronAdaptersFromEnv` when DATABASE_URL +
 *     ACE_API_KEY + AGENT_SECRET_KEY_BASE58 are set (production / preview).
 *   - Returns 503 if hard-required env is missing so a misconfigured deploy
 *     surfaces immediately rather than running with silent stubs.
 */

import { Connection } from '@solana/web3.js';
import { runCuratorTick } from '@/autonomous-curator';
import { createCronAdaptersFromEnv } from '@/cron-adapters';
import { env, resolveRpcUrl } from '@/env';

// Minimal error body (ADR 0016 F): only the step, never the raw reason — provider
// error text or a cost-cap message ($ figures) must not leak through the response.
type CronErrorResponse = { ok: false; step: string };

import { discoverSapAgents, summarizeDiscovery } from '@/modules/sap-discovery';
import { makeFetchHttpClient, makeInMemoryPostedStore } from '@/webhook-poster';

export async function GET(req: Request): Promise<Response> {
  const auth = req.headers.get('Authorization');
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!env.WEBHOOK_URL) {
    return Response.json(
      { error: 'WEBHOOK_URL not configured — set it in Vercel environment variables' },
      { status: 503 },
    );
  }

  let factoryResult: Awaited<ReturnType<typeof createCronAdaptersFromEnv>>;
  try {
    factoryResult = await createCronAdaptersFromEnv({
      DATABASE_URL: env.DATABASE_URL,
      ACE_API_KEY: env.ACE_API_KEY,
      SOLANA_RPC_URL: env.SOLANA_RPC_URL,
      SYNAPSE_RPC_URL: env.SYNAPSE_RPC_URL,
      AGENT_SECRET_KEY_BASE58: env.AGENT_SECRET_KEY_BASE58,
      AGENT_WALLET: env.NEXT_PUBLIC_AGENT_WALLET,
      WEBHOOK_URL: env.WEBHOOK_URL,
      STORY_BASE_URL: env.NEXT_PUBLIC_APP_URL,
      ACE_CHAT_MODEL_HEAVY: env.ACE_CHAT_MODEL_HEAVY,
      VIDEO_PROVIDER: env.VIDEO_PROVIDER,
      VIDEO_MODEL: env.VIDEO_MODEL,
      VIDEO_FALLBACK_PROVIDER: env.VIDEO_FALLBACK_PROVIDER,
      VIDEO_FALLBACK_MODEL: env.VIDEO_FALLBACK_MODEL,
      AUDIO_PROVIDER: env.AUDIO_PROVIDER,
      AUDIO_MODEL: env.AUDIO_MODEL,
      MEDIA_COLLECT_TIMEOUT_MS: env.MEDIA_COLLECT_TIMEOUT_MS,
      BLOB_READ_WRITE_TOKEN: env.BLOB_READ_WRITE_TOKEN,
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 503 });
  }

  // Weak SAP discovery — non-blocking operator log surface.
  // Snapshots the SAP capability network at tick time; never fails the tick.
  try {
    const rpcUrl = resolveRpcUrl(env.SOLANA_RPC_URL, env.SYNAPSE_RPC_URL);
    const agents = await discoverSapAgents({ connection: new Connection(rpcUrl, 'confirmed') });
    console.log(`[curator-tick] ${summarizeDiscovery(agents)}`);
  } catch (err) {
    console.warn(`[curator-tick] sap-discovery failed: ${(err as Error).message}`);
  }

  let result: Awaited<ReturnType<typeof runCuratorTick>>;
  try {
    result = await runCuratorTick({
      ...factoryResult.deps,
      webhook: {
        webhookUrl: env.WEBHOOK_URL,
        store: makeInMemoryPostedStore(),
        http: makeFetchHttpClient(),
      },
      storyBaseUrl: factoryResult.storyBaseUrl,
    });
  } catch (err) {
    const step =
      err !== null &&
      typeof err === 'object' &&
      'step' in err &&
      typeof (err as { step: unknown }).step === 'string'
        ? (err as { step: string }).step
        : 'unknown';
    const reason = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error('[curator-tick] error', { step, reason, stack });
    return Response.json({ ok: false, step } satisfies CronErrorResponse, { status: 500 });
  }

  if (!result.ok) {
    const { step, reason } = result;
    if (step === 'dormant') {
      console.log('[curator-tick] dormant', { reason });
      // Minimal body (ADR 0016 F): no CuratorResult internals.
      return Response.json({ dormant: true }, { status: 200 });
    }
    console.error('[curator-tick] tick failed', { step, reason });
    return Response.json({ ok: false, step } satisfies CronErrorResponse, { status: 500 });
  }

  // Minimal success body (ADR 0016 F): never the full CuratorResult (no
  // rationale, receipts, or sigs leak through the public route response).
  return Response.json({ tickLogId: result.tickLogId, storyUrl: result.storyUrl }, { status: 200 });
}

// POST alias for manual trigger
export { GET as POST };
