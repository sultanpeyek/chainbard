import { z } from 'zod';
import { type DexscreenerClient, resolveTokenMint } from '@/dexscreener-resolver';

// ── Types ─────────────────────────────────────────────────────────────────────

// 'wallet' is retained for a future SERP-grounded wallet resolver; the current
// pick path emits 'token' (a Dexscreener-resolved mint).
export type CandidateKind = 'wallet' | 'token';
export type CandidateSource = 'serp' | 'chat';

export interface Candidate {
  kind: CandidateKind;
  identifier: string;
  rationale: string;
  source: CandidateSource;
  /** The SERP headline/snippet that named this token (provenance, two-tier truth). */
  sourceHitText: string;
  /** Deterministic news-seeded query derived from ticker + source headline. */
  newsQuery: string;
}

export const pickSchema = z.object({
  kind: z.enum(['wallet', 'token']),
  identifier: z.string().min(1),
  rationale: z.string().min(1),
  // '' is allowed: provenance is best-effort and may be absent.
  sourceHitText: z.string(),
  newsQuery: z.string(),
});

export type SignalPick = z.infer<typeof pickSchema>;

export interface SignalResult {
  candidates: Candidate[];
  pick: SignalPick;
}

export class NoFreshCandidatesError extends Error {
  constructor(consideredCount: number) {
    super(
      `no fresh candidates: all ${consideredCount} candidates were rendered within the dedup window`,
    );
    this.name = 'NoFreshCandidatesError';
  }
}

// Thrown when not one chat-supplied ticker survived resolution — every ticker
// either failed the SERP-grounding gate or did not resolve to a real Solana mint
// above the liquidity/volume floor. Fail-closed: the tick skips rather than
// rendering an invented subject.
export class NoResolvableCandidatesError extends Error {
  constructor(consideredCount: number) {
    super(`no resolvable candidates: none of ${consideredCount} chat tickers resolved to a mint`);
    this.name = 'NoResolvableCandidatesError';
  }
}

// ── External boundary interfaces ──────────────────────────────────────────────

export interface SerpHit {
  title: string;
  snippet: string;
  url: string;
}

export interface SerpClient {
  search(query: string): Promise<SerpHit[]>;
}

export interface AggregatorChatClient {
  complete<T>(args: { system: string; user: string; schema: z.ZodType<T> }): Promise<{ data: T }>;
}

export interface RenderedSubjectStore {
  hasBeenRendered(identifier: string, withinDays: number): Promise<boolean>;
}

export interface AggregatorDeps {
  serp: SerpClient;
  chat: AggregatorChatClient;
  dex: DexscreenerClient;
  recentSubjects: RenderedSubjectStore;
  dedupeWindowDays?: number; // defaults to 7
}

// ── Internals ─────────────────────────────────────────────────────────────────

// The LLM picks a token ticker FROM the SERP text and quotes the hit it came
// from. It never authors an address — Dexscreener resolves the real mint.
const chatCandidateSchema = z.object({
  ticker: z.string().min(1),
  sourceHitText: z.string().min(1),
  rationale: z.string().min(1),
});

const chatOutputSchema = z.object({
  candidates: z.array(chatCandidateSchema).min(1),
  pick: chatCandidateSchema,
});

// Deterministic news-seeded query: the ticker followed by the first ~6 salient
// words of the source headline (the snippet that named the token). Drives the
// Director's token serpQuery (ADR 0014, two-tier truth).
const NEWS_QUERY_WORDS = 6;
export function buildNewsQuery(ticker: string, sourceHitText: string): string {
  const salient = sourceHitText
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .slice(0, NEWS_QUERY_WORDS)
    .join(' ');
  return [ticker, salient].filter((s) => s.length > 0).join(' ');
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function aggregateSignals(deps: AggregatorDeps): Promise<SignalResult> {
  const windowDays = deps.dedupeWindowDays ?? 7;

  // Step 1: SERP/news pull → context for the chat step. More hits ⇒ more tickers
  // the LLM can ground on, which raises the odds a candidate survives dedup.
  const serpHits = await deps.serp.search('trending Solana tokens crypto today');
  const context = serpHits
    .slice(0, 10)
    .map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}`)
    .join('\n');

  // Step 2: Structured-output chat decision — extract token tickers grounded in
  // the SERP, each with the hit text it was taken from.
  const system =
    'You are a Solana on-chain curator. Given recent news snippets, identify viral-potential Solana token tickers to render stories for. Return valid JSON only.';
  const user = [
    'Recent Solana SERP results:',
    context || '(no SERP results)',
    '',
    'Return JSON { candidates: [{ticker:<symbol from the snippets>, sourceHitText:<the snippet text it appears in>, rationale:<why viral>}, ...], pick: <best candidate> }',
    'List EVERY distinct token ticker that literally appears in the snippets above (aim for as many as you can find, ideally 8 or more) — breadth matters because many candidates get filtered downstream. Never invent an address.',
  ].join('\n');

  const chatOut = (await deps.chat.complete({ system, user, schema: chatOutputSchema })).data;

  // Step 3: Resolve each ticker to a real mint. A null resolution IS the
  // rejection (fail-closed) — the resolver enforces SERP-grounding, the Solana
  // chain, exact symbol match, and the liquidity/volume floor.
  const seenMint = new Set<string>();
  const resolved: Candidate[] = [];
  let pickMint: string | undefined;
  for (const c of chatOut.candidates) {
    const token = await resolveTokenMint(c.ticker, c.sourceHitText, { dex: deps.dex });
    if (!token) continue;
    if (c.ticker === chatOut.pick.ticker) pickMint = token.mint;
    if (seenMint.has(token.mint)) continue;
    seenMint.add(token.mint);
    resolved.push({
      kind: 'token',
      identifier: token.mint,
      rationale: c.rationale,
      source: 'chat',
      sourceHitText: c.sourceHitText,
      newsQuery: buildNewsQuery(c.ticker, c.sourceHitText),
    });
  }

  if (resolved.length === 0) {
    throw new NoResolvableCandidatesError(chatOut.candidates.length);
  }

  // Step 4: Filter out subjects rendered within the dedup window.
  const notYetRendered: Candidate[] = [];
  for (const c of resolved) {
    if (!(await deps.recentSubjects.hasBeenRendered(c.identifier, windowDays))) {
      notYetRendered.push(c);
    }
  }

  // Strict dedup: if every resolved mint was rendered within the window, skip the
  // tick rather than re-rendering the same subject (review feedback on #27).
  if (notYetRendered.length === 0) {
    throw new NoFreshCandidatesError(resolved.length);
  }

  // Step 5: Prefer the chat's pick if its mint survived dedup; else first survivor.
  const pickSurvived = pickMint ? notYetRendered.find((c) => c.identifier === pickMint) : undefined;
  const chosen = pickSurvived ?? notYetRendered[0];

  const pick: SignalPick = {
    kind: chosen.kind,
    identifier: chosen.identifier,
    rationale: chosen.rationale,
    sourceHitText: chosen.sourceHitText,
    newsQuery: chosen.newsQuery,
  };

  return { candidates: resolved, pick };
}
