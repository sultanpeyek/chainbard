import { z } from 'zod';

// Single source of truth for every env var: zod shape + default.
// Required-ness is decided PER CONTEXT (strict in index.ts, lenient in cli.ts).
// Groups + order below are mirrored in index.ts, cli.ts, and .env.example.
export const fields = {
  // — Secrets (required app-wide) —
  ACE_API_KEY: z.string().min(1),
  AGENT_SECRET_KEY_BASE58: z.string().min(1),
  CRON_SECRET: z.string().min(1),
  DATABASE_URL: z.string().url(),
  DEMO_SECRET: z.string().min(1),

  // — RPC endpoints (all optional; read resolver applies SOLANA → SYNAPSE → public,
  // write resolver applies SOLANA_SEND → SOLANA → public) —
  SYNAPSE_RPC_URL: z.string().url().optional(),
  SOLANA_RPC_URL: z.string().url().optional(),
  // Optional override for the write/broadcast path (memo, priority-fee estimate,
  // facilitator settle). Lets writes use a separate endpoint; falls back to
  // SOLANA_RPC_URL when unset.
  SOLANA_SEND_RPC_URL: z.string().url().optional(),

  // — ACE platform & facilitator —
  ACE_API_BASE: z.string().url().default('https://api.acedata.cloud'),
  ACE_CHAT_MODEL: z.string().optional(),
  // SoTA "heavy" model for the write + Director steps (ADR 0015). Optional and
  // OFF by default: when unset the heavy steps fall back to ACE_CHAT_MODEL so the
  // tick stays green out-of-the-box. Set to e.g. `gpt-5.5-pro` AFTER the Phase-0
  // x402 probe confirms the model settles on the facilitator.
  ACE_CHAT_MODEL_HEAVY: z.string().optional(),
  ACE_FACILITATOR_PUBKEY: z.string().default('3SPm6qbgsDkj24MuR8Ss4sH97fziqyCiqFKDyeVU2igq'),
  ACE_FACILITATOR_URL: z.string().url().default('https://facilitator.acedata.cloud'),

  // — Video service (ADR 0015, abstract data-motion only) —
  // provider+model name the priciest-viable chain (veo3 → kling fallback).
  VIDEO_PROVIDER: z.string().default('veo'),
  VIDEO_MODEL: z.string().default('veo3'),
  VIDEO_FALLBACK_PROVIDER: z.string().default('kling'),
  VIDEO_FALLBACK_MODEL: z.string().optional(),

  // — Audio service (ADR 0015, spoken-word narration only via Fish) —
  AUDIO_PROVIDER: z.string().default('fish'),
  AUDIO_MODEL: z.string().optional(),

  // Poll budget (ms) for the inline collect of an async video/audio task. Volume
  // is booked at the POST (wait:false), so this only bounds how long a tick waits
  // to attach the finished asset before giving up (the story still ships).
  MEDIA_COLLECT_TIMEOUT_MS: z.coerce.number().default(120000),

  // — Vercel Blob (stores generated video/audio) —
  BLOB_READ_WRITE_TOKEN: z.string().optional(),

  // — Upstash QStash / Workflow (durable hourly trigger, ADR 0015) —
  QSTASH_TOKEN: z.string().optional(),
  QSTASH_CURRENT_SIGNING_KEY: z.string().optional(),
  QSTASH_NEXT_SIGNING_KEY: z.string().optional(),
  // Public URL of the durable workflow route the QStash schedule POSTs.
  WORKFLOW_URL: z.string().url().optional(),
  // Cron expression for the QStash schedule (default hourly).
  CRON_CADENCE_CRON: z.string().default('0 * * * *'),

  // — On-chain constants & pricing —
  ACE_COST_PER_RENDER_USDC: z.coerce.number().default(0.05),
  DAILY_ACE_CAP_USDC: z.coerce.number().default(2),
  MINT_PRICE_USDC: z.coerce.number().default(0.3),
  USDC_MINT: z.string().default('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),

  // — Image generation —
  // Inline (non-midjourney) providers return one image synchronously in seconds,
  // so 30s is ample headroom and keeps the function well under Hobby's 300s cap.
  // Midjourney is queue-based (50-150s) and was dropped from the default chain —
  // raise this only if you reintroduce it. (function maxDuration is 300s.)
  IMAGE_GEN_TIMEOUT_MS: z.coerce.number().default(30000),
  IMAGE_PROVIDER: z.string().default('nano-banana'),
  IMAGE_FALLBACK_PROVIDER: z.string().default('seedream'),
  PLACEHOLDER_IMAGE_URL: z.string().url().optional(),

  // — Webhook —
  WEBHOOK_URL: z.string().url().optional(),

  // — Client (NEXT_PUBLIC_*) —
  NEXT_PUBLIC_AGENT_WALLET: z.string().default('9cssRtj1tpo8juYMKVw4BLonEXnSH2e6bfc9Qp88fN48'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_SOLANA_RPC_URL: z.string().url().default('https://api.mainnet-beta.solana.com'),

  // — Script-only knobs —
  BUYER_KEY_PATH: z.string().optional(),
  CHAT_ENDPOINT: z.string().optional(),
  CHAT_MODEL: z.string().optional(),
  MINT_ENDPOINT: z.string().url().optional(),
  SERP_ENDPOINT: z.string().optional(),
  TEST_AGENT_DESCRIPTION: z.string().optional(),
  TEST_AGENT_NAME: z.string().optional(),
} as const;
