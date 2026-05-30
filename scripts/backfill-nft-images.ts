/**
 * Backfill `imageUri` (on-chain NFT art) onto already-cached NFT story rows.
 *
 * Cheap path: a single DAS `getAsset` per mint (RPC only — no chat, no image
 * generation, no spend). Patches `story.imageUri` in place so the share page's
 * left card renders the real artwork instead of the procedural SVG fallback.
 *
 * Env (auto-loaded by Bun from .env):
 *   DATABASE_URL       Neon connection string
 *   SYNAPSE_RPC_URL    DAS-capable Solana RPC endpoint
 *
 * Usage:
 *   bun run scripts/backfill-nft-images.ts                 # all nft rows missing a real imageUri
 *   bun run scripts/backfill-nft-images.ts <mint>          # one specific mint
 *   bun run scripts/backfill-nft-images.ts --dry-run       # report only, no writes
 */

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
const RPC_URL = process.env.SOLANA_RPC_URL ?? process.env.SYNAPSE_RPC_URL;

if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
if (!RPC_URL) throw new Error('SOLANA_RPC_URL (or SYNAPSE_RPC_URL) is required');

const DRY_RUN = process.argv.includes('--dry-run');
const explicitMint = process.argv.slice(2).find((a) => !a.startsWith('--'));

const sql = neon(DATABASE_URL);

async function dasImageUri(mint: string): Promise<string | null> {
  const res = await fetch(RPC_URL as string, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAsset', params: [mint] }),
  });
  if (!res.ok) throw new Error(`getAsset ${mint} failed: ${res.status}`);
  const json = (await res.json()) as {
    result?: { content?: { links?: { image?: string }; files?: { uri?: string }[] } };
    error?: { message: string };
  };
  if (json.error) throw new Error(`getAsset ${mint} error: ${json.error.message}`);
  const content = json.result?.content;
  return content?.links?.image ?? content?.files?.[0]?.uri ?? null;
}

type Row = { input: string; imageUri: string | null };

async function main() {
  const rows: Row[] = explicitMint
    ? ((await sql`
        SELECT input, story->>'imageUri' AS "imageUri"
        FROM wallet_stories
        WHERE input = ${explicitMint} AND story->>'kind' = 'nft'
      `) as Row[])
    : ((await sql`
        SELECT input, story->>'imageUri' AS "imageUri"
        FROM wallet_stories
        WHERE story->>'kind' = 'nft'
          AND (story->>'imageUri' IS NULL OR story->>'imageUri' NOT LIKE 'http%')
      `) as Row[]);

  if (rows.length === 0) {
    console.log('No matching NFT rows to backfill.');
    return;
  }

  console.log(`Backfilling ${rows.length} NFT row(s)${DRY_RUN ? ' (dry-run)' : ''}…`);

  for (const row of rows) {
    try {
      const imageUri = await dasImageUri(row.input);
      if (!imageUri) {
        console.warn(`[skip] ${row.input} — DAS returned no image`);
        continue;
      }
      if (DRY_RUN) {
        console.log(`[dry] ${row.input} → ${imageUri}`);
        continue;
      }
      await sql`
        UPDATE wallet_stories
        SET story = jsonb_set(story, '{imageUri}', to_jsonb(${imageUri}::text), true)
        WHERE input = ${row.input} AND story->>'kind' = 'nft'
      `;
      console.log(`[ok]  ${row.input} → ${imageUri}`);
    } catch (err) {
      console.error(`[fail] ${row.input} — ${(err as Error).message}`);
    }
  }
}

main();
