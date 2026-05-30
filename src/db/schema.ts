import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import type { Receipt } from '@/story-renderer';

export const walletStories = pgTable(
  'wallet_stories',
  {
    inputHash: text('input_hash').primaryKey(),
    input: text('input').notNull(),
    story: jsonb('story').notNull(),
    provenance: text('provenance').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    memoSig: text('memo_sig'),
    paymentSig: text('payment_sig'),
    brief: text('brief'),
    briefHash: text('brief_hash'),
  },
  (t) => [
    check(
      'wallet_stories_provenance_check',
      sql`${t.provenance} IN ('seed', 'buyer', 'curator', 'demo')`,
    ),
    index('wallet_stories_input_idx').on(t.input),
    index('wallet_stories_created_at_idx').on(t.createdAt.desc()),
  ],
);

export const mintRuns = pgTable(
  'mint_runs',
  {
    intentId: text('intent_id').primaryKey(),
    inputHash: text('input_hash').notNull(),
    buyer: text('buyer').notNull(),
    settledSig: text('settled_sig'),
    state: text('state').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('mint_runs_state_check', sql`${t.state} IN ('settling', 'settled', 'published')`),
    index('mint_runs_input_hash_idx').on(t.inputHash),
  ],
);

export const tickLog = pgTable(
  'tick_log',
  {
    id: text('id').primaryKey(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    signalSource: text('signal_source').notNull(),
    candidatesConsidered: integer('candidates_considered').notNull(),
    pickKind: text('pick_kind').notNull(),
    pickIdentifier: text('pick_identifier').notNull(),
    pickRationale: text('pick_rationale').notNull(),
    pickSourceHit: text('pick_source_hit'),
    briefHash: text('brief_hash'),
    aceReceipts: jsonb('ace_receipts').notNull().$type<Receipt[]>(),
    memoSig: text('memo_sig'),
    webhookPosted: boolean('webhook_posted').notNull(),
    error: text('error'),
  },
  (t) => [
    index('tick_log_started_at_idx').on(t.startedAt.desc()),
    index('tick_log_pick_identifier_idx').on(t.pickIdentifier),
  ],
);

export const agentState = pgTable('agent_state', {
  key: text('key').primaryKey(),
  dormant: boolean('dormant').notNull().default(false),
  reason: text('reason'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
