/**
 * Durable Upstash Workflow — reactive media-attach (ADR 0016 D).
 *
 * The reactive mint publishes the story SYNCHRONOUSLY (chat + multi-SERP + image
 * inline) and then enqueues THIS job via the QStash Client. The job runs the slow
 * video/audio legs out-of-band on the SAME agent x402 self-broadcast rail, mirrors
 * the collected assets to Blob, and PATCHES story.videoUrl / story.audioUrl onto
 * the already-published row. The share page late-hydrates the media once it lands.
 *
 * Media is pure enrichment / fail-soft: a generate/collect/blob miss leaves the
 * story without that leg — it NEVER fails the job. `serve()` gives at-least-once
 * delivery + resume across the function limit; the patch is idempotent (a re-run
 * just regenerates and overwrites the same media keys).
 *
 * Payload: { input: string } — the public identifier the story was minted under.
 */

import { serve } from '@upstash/workflow/nextjs';
import { buildAgentX402Ace, buildMediaClients, type CronEnv } from '@/cron-adapters';
import { env, resolveSendRpcUrl, resolveSettleRpcUrl } from '@/env';
import type { AudioClient } from '@/lib/ace-audio-client';
import type { VideoClient } from '@/lib/ace-video-client';
import { enrichStoryMedia, type MediaEnrichableStory } from '@/lib/media-enrich';
import { computeInputHash, createSqlRepo, type StoryRepo } from '@/story-repo';

export const maxDuration = 300;

interface MediaAttachPayload {
  input?: string;
}

// CronEnv subset the media clients read (video/audio providers + timeouts + Blob).
function buildMediaEnv(): CronEnv {
  return {
    DATABASE_URL: env.DATABASE_URL,
    ACE_API_KEY: env.ACE_API_KEY,
    SOLANA_RPC_URL: env.SOLANA_RPC_URL,
    SYNAPSE_RPC_URL: env.SYNAPSE_RPC_URL,
    AGENT_SECRET_KEY_BASE58: env.AGENT_SECRET_KEY_BASE58,
    AGENT_WALLET: env.NEXT_PUBLIC_AGENT_WALLET,
    WEBHOOK_URL: env.WEBHOOK_URL ?? '',
    VIDEO_PROVIDER: env.VIDEO_PROVIDER,
    VIDEO_MODEL: env.VIDEO_MODEL,
    VIDEO_FALLBACK_PROVIDER: env.VIDEO_FALLBACK_PROVIDER,
    VIDEO_FALLBACK_MODEL: env.VIDEO_FALLBACK_MODEL,
    AUDIO_PROVIDER: env.AUDIO_PROVIDER,
    AUDIO_MODEL: env.AUDIO_MODEL,
    MEDIA_COLLECT_TIMEOUT_MS: env.MEDIA_COLLECT_TIMEOUT_MS,
    BLOB_READ_WRITE_TOKEN: env.BLOB_READ_WRITE_TOKEN,
  };
}

/** The media clients the attach step needs (built from the x402 rail by default). */
interface MediaAttachClients {
  video?: VideoClient;
  audio?: AudioClient;
  blobStore?: (url: string, key: string) => Promise<string>;
}

/**
 * Default rail builder: decode the agent keypair, open the send RPC, build the
 * x402 ace + media clients. Split out so a test can inject stub clients without
 * touching @solana/web3.js / bs58 / the Ace SDK.
 */
async function buildDefaultMediaClients(): Promise<MediaAttachClients> {
  const { Connection, Keypair } = await import('@solana/web3.js');
  const bs58Mod = (await import('bs58')) as unknown as {
    default?: { decode(s: string): Uint8Array };
    decode?(s: string): Uint8Array;
  };
  const decode = bs58Mod.default?.decode ?? bs58Mod.decode;
  if (!decode) throw new Error('bs58 decode unavailable');
  const agent = Keypair.fromSecretKey(decode(env.AGENT_SECRET_KEY_BASE58));
  // x402 media settlements (agent → AceData) — Synapse-first for compliance (Cat-2).
  const settleConnection = new Connection(
    resolveSettleRpcUrl(env.SYNAPSE_RPC_URL, env.SOLANA_RPC_URL),
    'confirmed',
  );
  // solana_send fallback: lands the settlement if Synapse can't confirm in time
  // (same signed tx → no double-spend).
  const fallbackConnection = new Connection(
    resolveSendRpcUrl(env.SOLANA_SEND_RPC_URL, env.SOLANA_RPC_URL),
    'confirmed',
  );
  const ace = await buildAgentX402Ace(agent, settleConnection, undefined, { fallbackConnection });
  return buildMediaClients(ace, buildMediaEnv());
}

/**
 * Core attach step (exported for direct test): load the published story by
 * identifier, fire+collect video/audio on the x402 rail, mirror to Blob, and
 * patch only the generated media keys onto the row. A missing row is a clean
 * no-op; media generation is fail-soft inside `enrichStoryMedia`. `buildClients`
 * is injectable for testing; production uses the x402 rail builder.
 */
export async function attachMediaForInput(
  input: string,
  repo: StoryRepo,
  buildClients: () => Promise<MediaAttachClients> = buildDefaultMediaClients,
): Promise<void> {
  const inputHash = computeInputHash(input);

  const row = await repo.getByInputHash(inputHash);
  if (!row) {
    console.warn(`[media-attach] no story row for ${input} — skipping`);
    return;
  }

  const { video, audio, blobStore } = await buildClients();

  // Stamp the media urls onto a local copy, then patch only the generated keys.
  const story = row.story as unknown as MediaEnrichableStory;
  await enrichStoryMedia(story, inputHash, { video, audio, blobStore });

  await repo.patchMedia(inputHash, {
    videoUrl: story.videoUrl,
    videoProvider: story.videoProvider,
    audioUrl: story.audioUrl,
    audioProvider: story.audioProvider,
  });
}

export const { POST } = serve<MediaAttachPayload>(async (context) => {
  const input = context.requestPayload?.input?.trim();
  if (!input) return; // nothing to attach to — end cleanly.

  // One durable step: build the rail, load the story, fire+collect media, patch.
  // Self-broadcast media never inline-waits long enough to need per-call steps;
  // a resume just re-runs the whole (idempotent) attach.
  await context.run('media-attach', async () => {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(env.DATABASE_URL);
    const repo = createSqlRepo(sql as Parameters<typeof createSqlRepo>[0]);
    await attachMediaForInput(input, repo);
  });
});
