import { desc } from 'drizzle-orm';
import type { TickLog } from '@/autonomous-curator';
import type { Db } from '@/db';
import { schema } from '@/db';

const { tickLog } = schema;

// A rendered tick row mirrors the persisted TickLog shape exactly.
export type ActivityTick = TickLog;

/**
 * Read the autonomous-curator tick history, newest first. Read-only; uses the
 * existing `tick_log_started_at_idx` (started_at desc) index.
 */
export async function listTicks(db: Db, limit = 100): Promise<ActivityTick[]> {
  const rows = await db.select().from(tickLog).orderBy(desc(tickLog.startedAt)).limit(limit);

  return rows.map((r) => ({
    id: r.id,
    startedAt: r.startedAt,
    signalSource: r.signalSource,
    candidatesConsidered: r.candidatesConsidered,
    pickKind: r.pickKind,
    pickIdentifier: r.pickIdentifier,
    pickRationale: r.pickRationale,
    // Nullable column (pre-#2 rows persist NULL); surface '' so the TickLog
    // shape (pickSourceHit: string) stays satisfied.
    pickSourceHit: r.pickSourceHit ?? '',
    // Pre-briefHash rows persist NULL; surface the sha256('') digest so the
    // TickLog shape (briefHash: string) stays satisfied.
    briefHash: r.briefHash ?? 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    aceReceipts: r.aceReceipts,
    memoSig: r.memoSig,
    webhookPosted: r.webhookPosted,
    error: r.error,
  }));
}
