/**
 * Phase-0 x402 probe — fire ONE minimal paid call per Ace service over the
 * autonomous burn rail and log the settlement, so the operator can confirm each
 * service actually settles USDC on the facilitator BEFORE turning the cron on.
 *
 * Unlike scripts/test-x402-payment.ts (which builds the X-Payment envelope by
 * hand), this drives the real production path: the agent keypair → the structural
 * SolanaWalletAdapter (buildAgentSolanaWalletAdapter, the same one the cron uses)
 * → createX402PaymentHandler → AceDataCloud. THE AGENT IS FEE-PAYER and broadcasts
 * each settlement, so it needs both USDC (to pay the service) and SOL (for tx fees).
 *
 * OPERATOR: fund the agent wallet with USDC + SOL FIRST. This script is NOT run in
 * CI/here — it is compile-only. Run it manually once the wallet is funded:
 *   bun run scripts/spikes/x402-probe.ts
 *
 * Each call is wrapped in try/catch and prints `[PROBE x] OK …` / `FAILED …`, so a
 * single failing service never aborts the rest of the sweep. Video/audio use
 * wait:false (async tasks) — we capture the taskId, then call ace.tasks.get on one
 * captured id to confirm retrieval works (retrieve should be free, no settlement).
 *
 * Required env:
 *   AGENT_SECRET_KEY_BASE58            — base58 secret of the agent keypair (payer)
 *   SOLANA_RPC_URL / SOLANA_SEND_RPC_URL / SYNAPSE_RPC_URL  — for self-broadcast
 *
 * Optional env:
 *   ACE_CHAT_MODEL_HEAVY               — heavy chat model (default gpt-5.5-pro)
 */

import type { PaymentHandler } from '@acedatacloud/sdk';
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { buildAgentSolanaWalletAdapter } from '@/cron-adapters';
import { extractTaskId } from '@/lib/ace-media';
import { env, requireEnv, resolveSendRpcUrl, rpcHost } from '../../src/env/cli';

const HEAVY_CHAT_MODEL = process.env.ACE_CHAT_MODEL_HEAVY?.trim() || 'gpt-5.5-pro';

// One captured async task id (video/audio) to confirm tasks.get retrieval works.
let capturedTaskId: string | undefined;
let capturedService: string | undefined;

interface ProbeResult {
  service: string;
  ok: boolean;
  detail: string;
}

const results: ProbeResult[] = [];

/** Run one probe, logging OK/FAILED and recording the outcome. Never throws. */
async function probe(service: string, fn: () => Promise<string>): Promise<void> {
  try {
    const detail = await fn();
    console.log(`[PROBE ${service}] OK ${detail}`);
    results.push({ service, ok: true, detail });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[PROBE ${service}] FAILED ${msg}`);
    results.push({ service, ok: false, detail: msg });
  }
}

async function main() {
  const agent = Keypair.fromSecretKey(bs58.decode(requireEnv('AGENT_SECRET_KEY_BASE58')));
  // The agent self-broadcasts every settlement, so use the WRITE/send RPC
  // (transaction-capable), not a DAS/read endpoint.
  const sendConnection = new Connection(
    resolveSendRpcUrl(env.SOLANA_SEND_RPC_URL, env.SOLANA_RPC_URL),
    'confirmed',
  );

  // Structural SolanaWalletAdapter — the exact adapter the autonomous cron wires.
  const adapter = buildAgentSolanaWalletAdapter(agent, sendConnection);

  // Lazy import keeps the heavy x402 dep out of any module that imports this file.
  const { createX402PaymentHandler } = await import('@acedatacloud/x402-client');
  const { AceDataCloud } = await import('@acedatacloud/sdk');
  // x402-client's handler is structurally compatible but a distinct nominal type
  // across packages; cast at the boundary (same pattern as cron-adapters).
  const ace = new AceDataCloud({
    paymentHandler: createX402PaymentHandler({
      network: 'solana',
      solanaWallet: adapter,
    }) as unknown as PaymentHandler,
  });

  console.log('═══════════════════════════════════════════════════════');
  console.log('  x402 Phase-0 probe (one paid call per service)');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Agent (payer): ${agent.publicKey.toBase58()}`);
  console.log(
    `  Send RPC host: ${rpcHost(resolveSendRpcUrl(env.SOLANA_SEND_RPC_URL, env.SOLANA_RPC_URL))}`,
  );
  console.log(`  Heavy model:   ${HEAVY_CHAT_MODEL}`);
  console.log('  ⚠ Each OK line below = real USDC settled by the agent wallet.');
  console.log();

  // ── chat (heavy model) ──
  await probe('chat', async () => {
    const resp = await ace.openai.chat.completions.create({
      model: HEAVY_CHAT_MODEL,
      messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
    });
    const choices = (resp as { choices?: Array<{ message?: { content?: string } }> }).choices;
    const content = choices?.[0]?.message?.content ?? '(no content)';
    return `chat content="${content.slice(0, 40)}"`;
  });

  // ── search google ──
  await probe('search', async () => {
    const resp = await ace.search.google({ query: 'solana usdc x402 facilitator' });
    const organic = (resp as { organic?: unknown[] }).organic;
    return `search organic=${Array.isArray(organic) ? organic.length : 0} results`;
  });

  // ── image generation (inline; returns synchronously) ──
  await probe('image', async () => {
    const resp = await ace.openai.images.generate({
      model: 'nano-banana',
      prompt: 'abstract geometric data card, kinetic typography, no beings',
      n: 1,
    });
    const data = (resp as { data?: Array<{ url?: string }> }).data;
    const url = data?.[0]?.url ?? '(no url)';
    return `image url=${url.slice(0, 60)}`;
  });

  // ── video veo3 (async, wait:false → TaskHandle/task id) ──
  await probe('video-veo', async () => {
    const resp = await ace.video.generate({
      provider: 'veo',
      model: 'veo3',
      prompt: 'abstract animated data-motion card, geometric kinetic typography, no beings',
      action: 'text2video',
      wait: false,
    });
    const taskId = extractTaskId(resp);
    if (!taskId) throw new Error('no task id in veo response');
    capturedTaskId ??= taskId;
    capturedService ??= 'veo';
    return `taskId=${taskId}`;
  });

  // ── video kling (fallback provider) ──
  await probe('video-kling', async () => {
    const resp = await ace.video.generate({
      provider: 'kling',
      model: 'kling-v2-5-turbo',
      prompt: 'abstract animated data-motion card, geometric kinetic typography, no beings',
      action: 'text2video',
      wait: false,
    });
    const taskId = extractTaskId(resp);
    if (!taskId) throw new Error('no task id in kling response');
    capturedTaskId ??= taskId;
    capturedService ??= 'kling';
    return `taskId=${taskId}`;
  });

  // ── audio fish (async, wait:false → TaskHandle/task id) ──
  await probe('audio-fish', async () => {
    const resp = await ace.audio.generate({
      provider: 'fish',
      prompt: 'A spoken-word reading of a short market note. No music, no instruments.',
      // fish speech REQUIRES voice_id (and rejects model) — 'default' = mainstream voice.
      voice_id: 'default',
      wait: false,
    });
    const taskId = extractTaskId(resp);
    if (!taskId) throw new Error('no task id in fish response');
    capturedTaskId ??= taskId;
    capturedService ??= 'fish';
    return `taskId=${taskId}`;
  });

  // ── tasks.get retrieval (should be FREE — no settlement) ──
  if (capturedTaskId) {
    await probe('tasks.get', async () => {
      const resp = await ace.tasks.get(capturedTaskId as string, { service: capturedService });
      const keys = Object.keys(resp).slice(0, 6).join(',');
      return `retrieved taskId=${capturedTaskId} (free) keys=[${keys}]`;
    });
  } else {
    console.log('[PROBE tasks.get] SKIPPED — no async task id captured to retrieve');
  }

  // ── summary ──
  console.log();
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('═══════════════════════════════════════════════════════');
  for (const r of results) {
    console.log(`  ${r.ok ? '✅' : '❌'} ${r.service.padEnd(12)} ${r.detail}`);
  }
  const okCount = results.filter((r) => r.ok).length;
  console.log();
  console.log(`  ${okCount}/${results.length} services settled. Verify usage at`);
  console.log('  https://platform.acedata.cloud dashboard + Solscan for the agent wallet.');
}

main().catch((err) => {
  console.error('✗ Fatal:', err);
  process.exit(1);
});
