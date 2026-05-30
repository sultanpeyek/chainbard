/**
 * PoC: probe AceDataCloud SERP API for Google Maps/Places — empirical check
 * for whether `reviews` come back in the response.
 *
 * Endpoint: POST https://api.acedata.cloud/serp/google
 *   body: { query, type: "maps" | "places", country?, language? }
 *
 * SerpMCP source (core/client.py + tools/search_tools.py) declares only
 * search_type ∈ {search, images, news, maps, places, videos}. No "reviews"
 * engine. This PoC dumps the FULL raw response for both `maps` and `places`
 * so we can see exactly what fields exist for a given query.
 *
 * Required env:
 *   ACE_API_KEY — from https://platform.acedata.cloud
 *
 * Usage:
 *   ACE_API_KEY=... bun run scripts/ace-serp-places.ts "Ku De Ta Bali"
 *   ACE_API_KEY=... bun run scripts/ace-serp-places.ts --type maps "Ku De Ta Bali"
 *   ACE_API_KEY=... bun run scripts/ace-serp-places.ts --raw "Ku De Ta Bali"
 */

import { env, requireEnv } from '../src/env/cli';

const BASE_URL = env.ACE_API_BASE;
const ENDPOINT = `${BASE_URL}/serp/google`;

type SearchType = 'maps' | 'places' | 'search';

async function callSerp(query: string, type: SearchType, token: string): Promise<unknown> {
  const payload = { query, type, country: 'id', language: 'en' };
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`✗ ${type} request failed: ${res.status}`);
    console.error(text);
    process.exit(1);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function findKeys(obj: unknown, target: RegExp, path = '', out: string[] = []): string[] {
  if (obj === null || obj === undefined) return out;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => findKeys(v, target, `${path}[${i}]`, out));
    return out;
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const next = path ? `${path}.${k}` : k;
      if (target.test(k)) out.push(next);
      findKeys(v, target, next, out);
    }
  }
  return out;
}

function summarize(label: string, body: unknown, raw: boolean) {
  console.log(`─── ${label} response ──────────────────────────────────`);
  if (raw) {
    console.log(JSON.stringify(body, null, 2));
    console.log();
    return;
  }
  if (typeof body !== 'object' || body === null) {
    console.log('  (non-object response)');
    console.log(body);
    return;
  }
  const root = body as Record<string, unknown>;
  console.log(`  Top-level keys: ${Object.keys(root).join(', ')}`);
  const reviewKeys = findKeys(body, /review/i);
  const ratingKeys = findKeys(body, /rating/i);
  console.log(`  Keys matching /review/i (${reviewKeys.length}):`);
  for (const k of reviewKeys.slice(0, 20)) console.log(`    ${k}`);
  if (reviewKeys.length > 20) console.log(`    … +${reviewKeys.length - 20} more`);
  console.log(`  Keys matching /rating/i (${ratingKeys.length}):`);
  for (const k of ratingKeys.slice(0, 10)) console.log(`    ${k}`);

  // common shapes
  for (const arrKey of ['local_results', 'place_results', 'places', 'maps_results']) {
    const arr = root[arrKey];
    if (Array.isArray(arr) && arr.length > 0) {
      console.log();
      console.log(`  Sample ${arrKey}[0]:`);
      console.log(`    ${JSON.stringify(arr[0]).slice(0, 600)}…`);
    }
  }
  console.log();
}

async function main() {
  const args = process.argv.slice(2);
  const raw = args.includes('--raw');
  const typeIdx = args.indexOf('--type');
  const requestedType = (typeIdx >= 0 ? args[typeIdx + 1] : null) as SearchType | null;
  const positional = args.filter(
    (a, i) => !a.startsWith('--') && (typeIdx < 0 || (i !== typeIdx && i !== typeIdx + 1)),
  );
  if (positional.length === 0) {
    console.error(
      'Usage: bun run scripts/ace-serp-places.ts [--type maps|places|search] [--raw] <query>',
    );
    process.exit(1);
  }
  const query = positional.join(' ');
  const token = requireEnv('ACE_API_KEY');

  console.log('═══════════════════════════════════════════════════════');
  console.log('  AceDataCloud SERP — Maps/Places review probe');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Query:    "${query}"`);
  console.log(`  Endpoint: ${ENDPOINT}`);
  console.log();

  const types: SearchType[] = requestedType ? [requestedType] : ['maps', 'places'];
  for (const t of types) {
    console.log(`  → calling type="${t}"...`);
    const body = await callSerp(query, t, token);
    summarize(t, body, raw);
  }

  console.log('─── Verdict ───────────────────────────────────────────');
  console.log('  If "review" keys absent above → SerpMCP cannot return reviews.');
  console.log('  Confirms: SerpMCP returns place metadata only (name, address,');
  console.log('  rating, total review count, maybe a snippet). No review text.');
  console.log();
  console.log('  Use scripts/fetch-place-reviews.ts (official Google API) for');
  console.log('  actual review text — capped at 5 per place but legal + free up');
  console.log('  to 1k Place Details Enterprise+Atmosphere calls/mo.');
}

main().catch((err) => {
  console.error('✗ Probe failed:', err);
  process.exit(1);
});
