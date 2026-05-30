import { eq, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { agentState } from '@/db/schema';

// ── Agent dormancy state (treasury exhaustion) ────────────────────────────────
// A single keyed row tracks whether the autonomous agent has gone dormant (e.g.
// funds exhausted). The curator tick reads it as a gate and writes it on funds
// exhaustion. Mirrors the SQL-repo style in src/cron-adapters.ts.

export interface AgentStateRepo {
  isDormant(): Promise<boolean>;
  setDormant(reason: string): Promise<void>;
  clearDormant(): Promise<void>;
}

export function createSqlAgentStateRepo(db: Db, key = 'agent'): AgentStateRepo {
  return {
    async isDormant() {
      const rows = await db
        .select({ dormant: agentState.dormant })
        .from(agentState)
        .where(eq(agentState.key, key))
        .limit(1);
      return rows[0]?.dormant ?? false;
    },
    async setDormant(reason: string) {
      await db
        .insert(agentState)
        .values({ key, dormant: true, reason })
        .onConflictDoUpdate({
          target: agentState.key,
          set: { dormant: true, reason, updatedAt: sql`now()` },
        });
    },
    async clearDormant() {
      await db
        .insert(agentState)
        .values({ key, dormant: false, reason: null })
        .onConflictDoUpdate({
          target: agentState.key,
          set: { dormant: false, reason: null, updatedAt: sql`now()` },
        });
    },
  };
}

export function createNoopAgentStateRepo(): AgentStateRepo {
  return {
    async isDormant() {
      return false;
    },
    async setDormant() {},
    async clearDormant() {},
  };
}
