/**
 * Phase D: register the autonomous-tick cron schedule with Upstash QStash.
 *
 * QStash invokes WORKFLOW_URL on the CRON_CADENCE_CRON cadence; the durable
 * Workflow route (src/app/api/workflow/autonomous-tick/route.ts) then runs one
 * curator tick per fire.
 *
 * WORKFLOW_URL may instead point at /api/cron/autonomous-tick with an
 * `Authorization: Bearer <CRON_SECRET>` header (pass via the `headers` option
 * below) for the simpler GET-route trigger — no durable resume, but no
 * QStash↔Workflow signing-key wiring either.
 *
 * Required env:
 *   QSTASH_TOKEN      — from https://console.upstash.com/qstash
 *   WORKFLOW_URL      — publicly reachable POST endpoint to invoke
 *   CRON_CADENCE_CRON — cron expression (default "0 * * * *", hourly)
 *
 * Usage:
 *   QSTASH_TOKEN=... WORKFLOW_URL=https://… bun run scripts/setup-qstash-schedule.ts
 *
 * Compile-only here — registering a real schedule needs live QStash credentials.
 */

import { Client } from '@upstash/qstash';

async function main() {
  const token = process.env.QSTASH_TOKEN;
  const destination = process.env.WORKFLOW_URL;
  const cron = process.env.CRON_CADENCE_CRON?.trim() || '0 * * * *';

  if (!token) {
    console.error('QSTASH_TOKEN missing — set it in .env');
    process.exit(1);
  }
  if (!destination) {
    console.error('WORKFLOW_URL missing — set it in .env');
    process.exit(1);
  }

  const c = new Client({ token });

  // Alternative for the GET-route trigger: add
  //   headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }
  // and point WORKFLOW_URL at /api/cron/autonomous-tick.
  const { scheduleId } = await c.schedules.create({
    destination,
    cron,
    method: 'POST',
  });

  console.log(`✓ schedule created: ${scheduleId}`);
  console.log(`  destination: ${destination}`);
  console.log(`  cron:        ${cron}`);
}

main().catch((err) => {
  console.error('✗ schedule setup failed:', err);
  process.exit(1);
});
