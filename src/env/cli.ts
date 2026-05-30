import { createEnv } from '@t3-oss/env-core';
import { fields } from './shared';

export const env = createEnv({
  server: {
    // — Secrets (optional here; scripts validate per-need via requireEnv) —
    ACE_API_KEY: fields.ACE_API_KEY.optional(),
    AGENT_SECRET_KEY_BASE58: fields.AGENT_SECRET_KEY_BASE58.optional(),
    CRON_SECRET: fields.CRON_SECRET.optional(),
    DATABASE_URL: fields.DATABASE_URL.optional(),
    DEMO_SECRET: fields.DEMO_SECRET.optional(),
    // — RPC endpoints —
    SYNAPSE_RPC_URL: fields.SYNAPSE_RPC_URL,
    SOLANA_RPC_URL: fields.SOLANA_RPC_URL,
    SOLANA_SEND_RPC_URL: fields.SOLANA_SEND_RPC_URL,
    // — ACE platform & facilitator —
    ACE_API_BASE: fields.ACE_API_BASE,
    ACE_CHAT_MODEL: fields.ACE_CHAT_MODEL,
    ACE_CHAT_MODEL_HEAVY: fields.ACE_CHAT_MODEL_HEAVY,
    ACE_FACILITATOR_PUBKEY: fields.ACE_FACILITATOR_PUBKEY,
    ACE_FACILITATOR_URL: fields.ACE_FACILITATOR_URL,
    // — Video service (ADR 0015, abstract data-motion only) —
    VIDEO_PROVIDER: fields.VIDEO_PROVIDER,
    VIDEO_MODEL: fields.VIDEO_MODEL,
    VIDEO_FALLBACK_PROVIDER: fields.VIDEO_FALLBACK_PROVIDER,
    VIDEO_FALLBACK_MODEL: fields.VIDEO_FALLBACK_MODEL,
    // — Audio service (ADR 0015, spoken-word narration only via Fish) —
    AUDIO_PROVIDER: fields.AUDIO_PROVIDER,
    AUDIO_MODEL: fields.AUDIO_MODEL,
    MEDIA_COLLECT_TIMEOUT_MS: fields.MEDIA_COLLECT_TIMEOUT_MS,
    // — Vercel Blob (stores generated video/audio) —
    BLOB_READ_WRITE_TOKEN: fields.BLOB_READ_WRITE_TOKEN,
    // — Upstash QStash / Workflow (durable hourly trigger, ADR 0015) —
    QSTASH_TOKEN: fields.QSTASH_TOKEN,
    QSTASH_CURRENT_SIGNING_KEY: fields.QSTASH_CURRENT_SIGNING_KEY,
    QSTASH_NEXT_SIGNING_KEY: fields.QSTASH_NEXT_SIGNING_KEY,
    WORKFLOW_URL: fields.WORKFLOW_URL,
    CRON_CADENCE_CRON: fields.CRON_CADENCE_CRON,
    // — On-chain constants & pricing —
    ACE_COST_PER_RENDER_USDC: fields.ACE_COST_PER_RENDER_USDC,
    DAILY_ACE_CAP_USDC: fields.DAILY_ACE_CAP_USDC,
    MINT_PRICE_USDC: fields.MINT_PRICE_USDC,
    USDC_MINT: fields.USDC_MINT,
    // — Image generation —
    IMAGE_GEN_TIMEOUT_MS: fields.IMAGE_GEN_TIMEOUT_MS,
    IMAGE_PROVIDER: fields.IMAGE_PROVIDER,
    IMAGE_FALLBACK_PROVIDER: fields.IMAGE_FALLBACK_PROVIDER,
    PLACEHOLDER_IMAGE_URL: fields.PLACEHOLDER_IMAGE_URL,
    // — Webhook —
    WEBHOOK_URL: fields.WEBHOOK_URL,
    // — Client (NEXT_PUBLIC_*) —
    NEXT_PUBLIC_AGENT_WALLET: fields.NEXT_PUBLIC_AGENT_WALLET,
    NEXT_PUBLIC_APP_URL: fields.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SOLANA_RPC_URL: fields.NEXT_PUBLIC_SOLANA_RPC_URL,
    // — Script-only knobs —
    BUYER_KEY_PATH: fields.BUYER_KEY_PATH,
    CHAT_ENDPOINT: fields.CHAT_ENDPOINT,
    CHAT_MODEL: fields.CHAT_MODEL,
    MINT_ENDPOINT: fields.MINT_ENDPOINT,
    SERP_ENDPOINT: fields.SERP_ENDPOINT,
    TEST_AGENT_DESCRIPTION: fields.TEST_AGENT_DESCRIPTION,
    TEST_AGENT_NAME: fields.TEST_AGENT_NAME,
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

export function requireEnv(key: keyof typeof env): string {
  const value = env[key];
  if (value === undefined || value === null || value === '') {
    throw new Error(`${key} missing — set it in .env`);
  }
  return value as string;
}

export function mintEndpoint(): string {
  return env.MINT_ENDPOINT ?? `${env.NEXT_PUBLIC_APP_URL}/api/mint/story`;
}

export { resolveRpcUrl, resolveSendRpcUrl, resolveSettleRpcUrl, rpcHost } from './rpc';
