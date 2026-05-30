import type { Metadata } from 'next';
import type { ActivityTick } from '@/activity-repo';
import { ActivityFeed } from '@/components/activity-feed';
import { env } from '@/env';

// Read-only transparency feed of the live tick_log table; always render fresh.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'activity — chainbard',
  description: 'Autonomous curator tick history with on-chain proof.',
};

async function loadTicks(): Promise<ActivityTick[]> {
  try {
    const { createDb } = await import('@/db');
    const { listTicks } = await import('@/activity-repo');
    return await listTicks(createDb(env.DATABASE_URL));
  } catch (e) {
    console.error('[activity] failed to load tick_log:', e);
    return [];
  }
}

// Quiet, fail-soft read of the agent dormancy flag (treasury exhausted). Never
// breaks the page: any error surfaces as "not dormant" so the feed still renders.
async function loadDormant(): Promise<boolean> {
  try {
    const { createDb } = await import('@/db');
    const { createSqlAgentStateRepo } = await import('@/agent-state-repo');
    return await createSqlAgentStateRepo(createDb(env.DATABASE_URL)).isDormant();
  } catch (e) {
    console.error('[activity] failed to read agent_state:', e);
    return false;
  }
}

export default async function ActivityPage() {
  const [ticks, dormant] = await Promise.all([loadTicks(), loadDormant()]);
  // Neutral status (ADR 0016 F): no treasury/floor/recovery wording.
  const note = dormant ? 'Curator is currently offline.' : undefined;
  return <ActivityFeed ticks={ticks} note={note} />;
}
