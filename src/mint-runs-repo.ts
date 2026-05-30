import type { SqlQueryFn } from '@/story-repo';

export type MintRunState = 'settling' | 'settled' | 'published';

export interface MintRunRow {
  intentId: string;
  inputHash: string;
  buyer: string;
  settledSig: string | null;
  state: MintRunState;
  createdAt: Date;
}

export interface MintRunsRepo {
  getByIntentId(intentId: string): Promise<MintRunRow | null>;
  /** Write-ahead insert at `state='settling'`; ON CONFLICT DO NOTHING so a replay during the window is a no-op. */
  insertSettling(args: { intentId: string; inputHash: string; buyer: string }): Promise<void>;
  markSettled(intentId: string, settledSig: string): Promise<void>;
  markPublished(intentId: string): Promise<void>;
  deleteRun(intentId: string): Promise<void>;
  /**
   * Reap a write-ahead row only while it is still `state='settling'`. Used on
   * pre-settle failure + the settling-recovery dead-end so a concurrent replay
   * of the SAME intent (which a winner has already advanced to `settled`) can
   * never delete the winner's row — the guard makes the loser's delete a no-op.
   */
  deleteIfSettling(intentId: string): Promise<void>;
}

export function createMintRunsRepo(sql: SqlQueryFn): MintRunsRepo {
  return {
    async getByIntentId(intentId: string): Promise<MintRunRow | null> {
      const rows = await sql`
        SELECT intent_id as "intentId", input_hash as "inputHash", buyer,
               settled_sig as "settledSig", state, created_at as "createdAt"
        FROM mint_runs
        WHERE intent_id = ${intentId}
        LIMIT 1
      `;
      const raw = rows[0] as Record<string, unknown> | undefined;
      if (!raw) return null;
      return {
        intentId: raw.intentId as string,
        inputHash: raw.inputHash as string,
        buyer: raw.buyer as string,
        settledSig: (raw.settledSig as string | null | undefined) ?? null,
        state: raw.state as MintRunState,
        createdAt: raw.createdAt as Date,
      };
    },

    async insertSettling({
      intentId,
      inputHash,
      buyer,
    }: {
      intentId: string;
      inputHash: string;
      buyer: string;
    }): Promise<void> {
      await sql`
        INSERT INTO mint_runs (intent_id, input_hash, buyer, state)
        VALUES (${intentId}, ${inputHash}, ${buyer}, 'settling')
        ON CONFLICT (intent_id) DO NOTHING
      `;
    },

    async markSettled(intentId: string, settledSig: string): Promise<void> {
      await sql`
        UPDATE mint_runs
        SET settled_sig = ${settledSig}, state = 'settled'
        WHERE intent_id = ${intentId}
      `;
    },

    async markPublished(intentId: string): Promise<void> {
      await sql`
        UPDATE mint_runs
        SET state = 'published'
        WHERE intent_id = ${intentId}
      `;
    },

    async deleteRun(intentId: string): Promise<void> {
      await sql`
        DELETE FROM mint_runs
        WHERE intent_id = ${intentId}
      `;
    },

    async deleteIfSettling(intentId: string): Promise<void> {
      await sql`
        DELETE FROM mint_runs
        WHERE intent_id = ${intentId} AND state = 'settling'
      `;
    },
  };
}
