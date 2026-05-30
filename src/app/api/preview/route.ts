/**
 * POST /api/preview — the free, pre-payment Preview (ADR 0006).
 *
 * Body: { input: string }. Returns the detected `kind` + a few cheap on-chain
 * facts from **free RPC only** (no Ace spend). This is the server side of the
 * homepage Mint widget's free preview: the browser cannot read SOLANA_RPC_URL /
 * SYNAPSE_RPC_URL, so detection + fact lookup run here, reusing the same
 * `makePreviewDeps` + `previewFacts` the `/[input]` paywall uses.
 */
import { makePreviewDeps } from '@/lib/preview-deps';
import { previewFacts } from '@/modules/preview-facts';

export async function POST(request: Request): Promise<Response> {
  let input: unknown;
  try {
    const body = (await request.json()) as { input?: unknown };
    input = body.input;
  } catch {
    return Response.json({ error: 'malformed body' }, { status: 400 });
  }

  if (typeof input !== 'string' || input.trim().length === 0) {
    return Response.json({ error: 'input required' }, { status: 400 });
  }

  try {
    const result = await previewFacts(input.trim(), makePreviewDeps());
    return Response.json(result);
  } catch {
    return Response.json({ error: 'preview unavailable' }, { status: 502 });
  }
}
