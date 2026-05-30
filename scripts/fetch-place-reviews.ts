/**
 * PoC: fetch Google Maps place reviews via official Places API (New) v1.
 *
 * Flow:
 *   1. Resolve a query (text or Maps URL) → placeId via Text Search.
 *   2. Get Place Details with reviews field mask.
 *   3. Print up to 5 reviews (API hard limit).
 *
 * SKUs billed (per Google pricing, 2026-05):
 *   - places:searchText       → Text Search Pro             ($32/1k, 5k free/mo)
 *   - places/{id} w/ reviews  → Place Details Enterprise+Atmosphere ($25/1k, 1k free/mo)
 *
 * Required env:
 *   GOOGLE_MAPS_API_KEY   — API key with "Places API (New)" enabled
 *
 * Usage:
 *   GOOGLE_MAPS_API_KEY=... bun run scripts/fetch-place-reviews.ts "Tipsy Bar Bali"
 *   GOOGLE_MAPS_API_KEY=... bun run scripts/fetch-place-reviews.ts "https://maps.app.goo.gl/xxxxx"
 *   GOOGLE_MAPS_API_KEY=... bun run scripts/fetch-place-reviews.ts --place-id ChIJ...
 */

export {};

const PLACES_BASE = 'https://places.googleapis.com/v1';
const DETAILS_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'rating',
  'userRatingCount',
  'googleMapsUri',
  'reviews',
].join(',');

interface TextSearchResponse {
  places?: Array<{
    id: string;
    displayName?: { text: string };
    formattedAddress?: string;
  }>;
}

interface Review {
  name: string;
  rating: number;
  text?: { text: string; languageCode: string };
  originalText?: { text: string; languageCode: string };
  authorAttribution: {
    displayName: string;
    uri: string;
    photoUri: string;
  };
  publishTime: string;
  relativePublishTimeDescription: string;
}

interface PlaceDetails {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  reviews?: Review[];
}

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`✗ Missing required env: ${name}`);
    console.error(`  Get key: https://console.cloud.google.com → APIs & Services → Credentials`);
    process.exit(1);
  }
  return v;
}

async function resolveMapsShortLink(url: string): Promise<string> {
  // maps.app.goo.gl short links redirect to long URL containing place data.
  const res = await fetch(url, { redirect: 'follow' });
  return res.url;
}

function extractQueryFromMapsUrl(url: string): string | null {
  // Long Maps URL pattern: /place/<Name>/@... or ?q=<query>
  const placeMatch = url.match(/\/place\/([^/@]+)/);
  if (placeMatch) return decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
  const qMatch = url.match(/[?&]q=([^&]+)/);
  if (qMatch) return decodeURIComponent(qMatch[1].replace(/\+/g, ' '));
  return null;
}

async function textSearch(query: string, apiKey: string): Promise<string> {
  const res = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
    },
    body: JSON.stringify({ textQuery: query, pageSize: 1 }),
  });
  if (!res.ok) {
    console.error(`✗ Text search failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const body = (await res.json()) as TextSearchResponse;
  const first = body.places?.[0];
  if (!first) {
    console.error(`✗ No place found for query: "${query}"`);
    process.exit(1);
  }
  console.log(`  Match: ${first.displayName?.text} — ${first.formattedAddress}`);
  console.log(`  ID:    ${first.id}`);
  return first.id;
}

async function getPlaceDetails(placeId: string, apiKey: string): Promise<PlaceDetails> {
  const res = await fetch(`${PLACES_BASE}/places/${placeId}`, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': DETAILS_FIELDS,
    },
  });
  if (!res.ok) {
    console.error(`✗ Place details failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  return (await res.json()) as PlaceDetails;
}

function printReviews(p: PlaceDetails) {
  console.log('─── Place ─────────────────────────────────────────────');
  console.log(`  Name:    ${p.displayName?.text ?? '(unknown)'}`);
  console.log(`  Address: ${p.formattedAddress ?? '(unknown)'}`);
  console.log(`  Rating:  ${p.rating ?? '—'} (${p.userRatingCount ?? 0} ratings)`);
  console.log(`  URL:     ${p.googleMapsUri ?? '—'}`);
  console.log();

  const reviews = p.reviews ?? [];
  if (reviews.length === 0) {
    console.log('  No reviews returned. (Place may have none, or field mask blocked.)');
    return;
  }
  console.log(`─── Reviews (${reviews.length} — API hard cap = 5) ──────────────`);
  for (const [i, r] of reviews.entries()) {
    console.log();
    console.log(`  [${i + 1}] ★${r.rating} — ${r.authorAttribution.displayName}`);
    console.log(`      ${r.relativePublishTimeDescription} (${r.publishTime})`);
    console.log(`      ${r.authorAttribution.uri}`);
    const text = r.text?.text ?? r.originalText?.text ?? '(no text)';
    const wrapped = text.replace(/\s+/g, ' ').slice(0, 400);
    console.log(`      "${wrapped}${text.length > 400 ? '…' : ''}"`);
  }
  console.log();
  console.log('  ⚠ Attribution mandatory if displayed publicly (authorAttribution.uri).');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: bun run scripts/fetch-place-reviews.ts <query|maps-url>');
    console.error('       bun run scripts/fetch-place-reviews.ts --place-id <ChIJ...>');
    process.exit(1);
  }
  const apiKey = requireEnv('GOOGLE_MAPS_API_KEY');

  console.log('═══════════════════════════════════════════════════════');
  console.log('  Google Places API (New) — reviews PoC');
  console.log('═══════════════════════════════════════════════════════');

  let placeId: string;
  if (args[0] === '--place-id' && args[1]) {
    placeId = args[1];
    console.log(`  Using direct place ID: ${placeId}\n`);
  } else {
    let query = args.join(' ');
    if (query.startsWith('http')) {
      console.log('─── Resolving Maps URL ────────────────────────────────');
      console.log(`  Input: ${query}`);
      const longUrl = query.includes('maps.app.goo.gl') ? await resolveMapsShortLink(query) : query;
      const extracted = extractQueryFromMapsUrl(longUrl);
      if (!extracted) {
        console.error(`✗ Could not extract place name from URL: ${longUrl}`);
        process.exit(1);
      }
      query = extracted;
      console.log(`  Extracted query: "${query}"\n`);
    }
    console.log('─── Text Search ───────────────────────────────────────');
    placeId = await textSearch(query, apiKey);
    console.log();
  }

  console.log('─── Place Details (with reviews) ──────────────────────');
  const details = await getPlaceDetails(placeId, apiKey);
  console.log();
  printReviews(details);
}

main().catch((err) => {
  console.error('✗ PoC failed:', err);
  process.exit(1);
});
