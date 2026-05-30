/**
 * Pre-mint famous chainbard fixtures with `provenance = 'seed'`.
 *
 * For each (kind, identifier, tone) in SEED_FIXTURES:
 *   1. Skip if `wallet_stories` already has a row for the inputHash.
 *   2. Fetch kind-specific spotlights via Synapse JSON-RPC + (token only) on-chain mint info.
 *   3. Render the story via AceData chat + image.
 *   4. Upsert into `wallet_stories` with provenance = 'seed'.
 *   5. Write a SAP Memo v2 receipt signed by the agent keypair.
 *
 * Env:
 *   SYNAPSE_RPC_URL          mainnet Solana RPC with DAS (`getAsset`) support
 *   ACE_API_KEY              AceData Cloud API token (chat + image + serp)
 *   DATABASE_URL             Postgres URL (story-repo backing store)
 *   AGENT_SECRET_KEY_BASE58  operator/agent keypair (base58) — pays + signs memos
 *
 * Usage:
 *   bun run scripts/seed-mint.ts            # full run
 *   bun run scripts/seed-mint.ts --dry-run  # render only; skip persist + memo
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { FIXTURES, type Fixture, type FixtureSlug, type FixtureTone } from '@/config/fixtures';
import { detectKind } from '@/kind-detector';
import { createMemoSender, createSapMemoWriter } from '@/modules/sap-memo-writer';
import {
  type DasAssetInfo,
  fetchNftSpotlights,
  fetchTokenSpotlights,
  fetchTxSpotlights,
  fetchWalletSpotlights,
  type NftSpotlightRpc,
  type SpotlightRpc,
  type SpotlightSigInfo,
  type SpotlightTxInfo,
  type TokenSpotlightSource,
  type TxRpcDetails,
  type TxSpotlightRpc,
} from '@/spotlight-fetcher';
import {
  type ChatClient,
  type ChatCompleteArgs,
  type ImageClient,
  type Receipt,
  renderNftStory,
  renderStory,
  renderTokenStory,
  renderTxStory,
  type SerpClient,
  type Tone,
} from '@/story-renderer';
import { computeInputHash } from '@/story-repo';
import { env, requireEnv, resolveRpcUrl, resolveSendRpcUrl } from '../src/env/cli';

// ── Fixture slate (derived view over the Fixture catalog) ─────────────────────
//
// Identifiers/labels/tones live in `src/config/fixtures.ts`; this list only
// chooses which catalog entries to mint and in what order. The homepage Featured
// strip derives from the same catalog, so the two can never drift apart.

const SEED_SLUGS: readonly FixtureSlug[] = [
  // Top 6 (priority slate)
  'wintermute',
  'wormholeTx',
  'slerfBurn',
  'madLads',
  'solanaMonkeyBusiness',
  'bonk',
  // Deprioritized (kept for completeness, minted last)
  'wormholeWallet',
];

export const SEED_FIXTURES: readonly Fixture[] = SEED_SLUGS.map((slug) => FIXTURES[slug]);

// ── Args / env ────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');

// ── Tone mapping ──────────────────────────────────────────────────────────────

const TONE_MAP: Record<FixtureTone, Tone> = {
  tragedy: 'Tragedy',
  comedy: 'Comedy',
  epic: 'Epic',
  elegy: 'Elegy',
  forensic: 'Forensic',
};

// ── Synapse JSON-RPC helpers ──────────────────────────────────────────────────

function makeRpcCaller(rpcUrl: string) {
  return async function rpc<T>(method: string, params: unknown[]): Promise<T> {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (!res.ok) throw new Error(`RPC ${method} failed: ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`RPC ${method} error: ${json.error.message}`);
    return json.result as T;
  };
}

// ── Wallet RPC (uses @solana/web3.js Connection for parity with mint route) ───

function buildWalletRpc(connection: Connection): SpotlightRpc {
  return {
    async getBalance(pubkey) {
      return BigInt(await connection.getBalance(new PublicKey(pubkey)));
    },
    async getSignaturesForAddress(pubkey, opts) {
      const sigs = await connection.getSignaturesForAddress(new PublicKey(pubkey), {
        limit: opts?.limit ?? 50,
      });
      return sigs.map(
        (s): SpotlightSigInfo => ({
          signature: s.signature,
          slot: s.slot,
          blockTime: s.blockTime ?? null,
          err: s.err,
        }),
      );
    },
    async getTransaction(sig) {
      const tx = await connection.getTransaction(sig, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
      });
      if (!tx) return null;
      const keys = tx.transaction.message.getAccountKeys();
      const accountKeys: string[] = [];
      for (let i = 0; i < keys.length; i++) {
        const k = keys.get(i);
        if (k) accountKeys.push(k.toBase58());
      }
      const info: SpotlightTxInfo = {
        accountKeys,
        ixCount: tx.transaction.message.compiledInstructions.length,
        feeLamports: tx.meta?.fee ?? 0,
        blockTime: tx.blockTime ?? null,
        err: tx.meta?.err ?? null,
      };
      return info;
    },
    async getTokenAccountsByOwner(pubkey) {
      const resp = await connection.getParsedTokenAccountsByOwner(new PublicKey(pubkey), {
        programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      });
      return { count: resp.value.length };
    },
    async getAssetsByOwner() {
      return { count: 0 };
    },
  };
}

// ── Tx RPC ────────────────────────────────────────────────────────────────────

function buildTxRpc(rpcUrl: string): TxSpotlightRpc {
  const rpc = makeRpcCaller(rpcUrl);
  return {
    async getTransactionDetails(sig) {
      type TxResp = {
        slot: number;
        blockTime?: number;
        transaction: {
          message: {
            accountKeys: Array<{ pubkey?: string } | string>;
            instructions: Array<{ programId?: string; programIdIndex?: number }>;
          };
        };
        meta: {
          fee?: number;
          err?: unknown;
          preBalances?: number[];
          postBalances?: number[];
          computeUnitsConsumed?: number;
        };
      };
      const tx = await rpc<TxResp | null>('getTransaction', [
        sig,
        { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
      ]);
      if (!tx) return null;

      const accountKeys = tx.transaction.message.accountKeys.map((k) =>
        typeof k === 'string' ? k : (k.pubkey ?? ''),
      );
      const signerPubkey = accountKeys[0] ?? null;

      const ixs = tx.transaction.message.instructions;
      const ixProgramIds = ixs.map(
        (ix) => ix.programId ?? accountKeys[ix.programIdIndex ?? 0] ?? '',
      );

      const pre = tx.meta.preBalances ?? [];
      const post = tx.meta.postBalances ?? [];
      const balanceDeltas = accountKeys
        .map((pubkey, i) => ({
          pubkey,
          preLamports: BigInt(pre[i] ?? 0),
          postLamports: BigInt(post[i] ?? 0),
        }))
        .filter((d) => d.preLamports !== d.postLamports);

      const details: TxRpcDetails = {
        slot: tx.slot,
        blockTime: tx.blockTime ?? null,
        feeLamports: tx.meta.fee ?? 0,
        computeUnitsConsumed: tx.meta.computeUnitsConsumed ?? null,
        accountKeys,
        signerPubkey,
        ixProgramIds,
        revertedInstructionIndices: [],
        balanceDeltas,
        err: tx.meta.err ?? null,
      };
      return details;
    },
  };
}

// ── NFT RPC (DAS getAsset + signatures + transactions) ────────────────────────

function buildNftRpc(rpcUrl: string): NftSpotlightRpc {
  const rpc = makeRpcCaller(rpcUrl);
  return {
    async getAsset(mint) {
      type DasResp = {
        content?: {
          metadata?: { name?: string; attributes?: { trait_type: string; value: unknown }[] };
          links?: { image?: string };
        };
        grouping?: { group_key: string; group_value: string }[];
        interface?: string;
        ownership?: { owner: string };
      } | null;
      const asset = await rpc<DasResp>('getAsset', [mint]);
      if (!asset) return null;
      const collection = asset.grouping?.find((g) => g.group_key === 'collection');
      const attrs = asset.content?.metadata?.attributes ?? [];
      const info: DasAssetInfo = {
        name: asset.content?.metadata?.name ?? 'Unknown NFT',
        collectionName: collection?.group_value ?? null,
        collectionKey: collection?.group_value ?? null,
        interface: asset.interface ?? 'unknown',
        attributes: attrs.map((a) => ({ trait_type: a.trait_type, value: String(a.value) })),
        imageUri: asset.content?.links?.image ?? null,
        currentOwner: asset.ownership?.owner ?? 'unknown',
      };
      return info;
    },
    async getSignaturesForAddress(address, opts) {
      type SigResp = Array<{ signature: string; slot: number; blockTime?: number; err: unknown }>;
      const sigs = await rpc<SigResp>('getSignaturesForAddress', [address, { limit: opts.limit }]);
      return sigs.map((s) => ({
        signature: s.signature,
        slot: s.slot,
        blockTime: s.blockTime ?? null,
        err: s.err,
      }));
    },
    async getTransaction(sig) {
      type TxResp = {
        transaction: { message: { accountKeys: Array<{ pubkey?: string } | string> } };
        meta?: { fee?: number; err?: unknown };
        blockTime?: number;
      } | null;
      const tx = await rpc<TxResp>('getTransaction', [
        sig,
        { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
      ]);
      if (!tx) return null;
      const accountKeys = tx.transaction.message.accountKeys.map((k) =>
        typeof k === 'string' ? k : (k.pubkey ?? ''),
      );
      const info: SpotlightTxInfo = {
        accountKeys,
        ixCount: 0,
        feeLamports: tx.meta?.fee ?? 0,
        blockTime: tx.blockTime ?? null,
        err: tx.meta?.err ?? null,
      };
      return info;
    },
  };
}

// ── Token source (free RPC/DAS — mint info + getAsset + oldest-sig launch) ────

function buildTokenSource(rpcUrl: string, connection: Connection): TokenSpotlightSource {
  const rpc = makeRpcCaller(rpcUrl);
  return {
    async getMintInfo(mint) {
      const info = await connection.getParsedAccountInfo(new PublicKey(mint));
      const parsed = (info.value?.data as { parsed?: { info?: Record<string, unknown> } })?.parsed
        ?.info;
      return {
        decimals: (parsed?.decimals as number) ?? 0,
        supplyRaw: BigInt((parsed?.supply as string) ?? '0'),
        mintRenounced: ((parsed?.mintAuthority as string | null) ?? null) === null,
        freezeRenounced: ((parsed?.freezeAuthority as string | null) ?? null) === null,
      };
    },
    async getAssetInfo(mint) {
      try {
        const res = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getAsset',
            params: { id: mint },
          }),
        });
        if (!res.ok) return { ticker: null, name: null, spotPriceUsd: null };
        const json = await res.json();
        const r = (json.result ?? {}) as Record<string, unknown>;
        const content = r.content as
          | { metadata?: { name?: unknown; symbol?: unknown } }
          | undefined;
        const tokenInfo = r.token_info as
          | { symbol?: unknown; price_info?: { price_per_token?: unknown } }
          | undefined;
        const symbol =
          typeof tokenInfo?.symbol === 'string'
            ? tokenInfo.symbol
            : typeof content?.metadata?.symbol === 'string'
              ? content.metadata.symbol
              : null;
        const name = typeof content?.metadata?.name === 'string' ? content.metadata.name : null;
        const price = tokenInfo?.price_info?.price_per_token;
        return {
          ticker: symbol && symbol.length > 0 ? symbol : null,
          name: name && name.length > 0 ? name : null,
          spotPriceUsd: typeof price === 'number' && Number.isFinite(price) ? price : null,
        };
      } catch {
        return { ticker: null, name: null, spotPriceUsd: null };
      }
    },
    async getLaunchedAt(mint) {
      try {
        const items = await rpc<Array<{ blockTime?: number | null }>>('getSignaturesForAddress', [
          mint,
          { limit: 1000 },
        ]);
        if (!Array.isArray(items) || items.length === 0) return null;
        const oldest = items[items.length - 1];
        return typeof oldest.blockTime === 'number' ? oldest.blockTime : null;
      } catch {
        return null;
      }
    },
  };
}

// ── Ace clients ───────────────────────────────────────────────────────────────

const ACE_BASE = 'https://api.acedata.cloud';

function makeAceChat(token: string): ChatClient {
  return {
    async complete<T>({ system, user, schema }: ChatCompleteArgs<T>) {
      const res = await fetch(`${ACE_BASE}/openai/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          response_format: { type: 'json_object' },
        }),
      });
      if (!res.ok) throw new Error(`Ace chat failed: ${res.status} ${await res.text()}`);
      const json = (await res.json()) as {
        choices: Array<{ message: { content: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        model?: string;
      };
      const content = json.choices?.[0]?.message?.content;
      if (!content) throw new Error('Ace returned empty choices');
      const raw = JSON.parse(content);
      return {
        data: schema.parse(raw) as T,
        promptTokens: json.usage?.prompt_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
        model: json.model ?? 'claude-sonnet-4-5',
      };
    },
  };
}

function makeAceSerp(token: string): SerpClient {
  return {
    async search(query) {
      const res = await fetch(`${ACE_BASE}/serp/google`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ query, type: 'search', language: 'en' }),
      });
      if (!res.ok) throw new Error(`Ace SERP failed: ${res.status}`);
      const json = (await res.json()) as {
        organic_results?: Array<{ snippet?: string; description?: string }>;
        results?: Array<{ snippet?: string; description?: string }>;
      };
      const rows = json.organic_results ?? json.results ?? [];
      const snippets = rows
        .map((r) => r.snippet ?? r.description ?? '')
        .filter(Boolean)
        .slice(0, 5);
      return { snippets };
    },
  };
}

function makeAceImage(token: string): ImageClient {
  return {
    async generate(prompt) {
      const res = await fetch(`${ACE_BASE}/images/midjourney`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt, action: 'generate' }),
      });
      if (!res.ok) throw new Error(`Ace image failed: ${res.status}`);
      const json = (await res.json()) as {
        data?: Array<{ url?: string }>;
        url?: string;
        image_url?: string;
      };
      const url = json.data?.[0]?.url ?? json.url ?? json.image_url;
      if (!url) throw new Error('Ace returned no image url');
      return { url, model: 'midjourney' };
    },
  };
}

// ── Story hash (canonical-form sha256) ────────────────────────────────────────

async function hashStory(story: unknown): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(JSON.stringify(story), 'utf8').digest('hex');
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface MintResult {
  fixture: Fixture;
  inputHash: string;
  status: 'minted' | 'skipped-exists' | 'skipped-placeholder' | 'failed';
  memoSig: string | null;
  error?: string;
}

async function main() {
  const rpcUrl = resolveRpcUrl(env.SOLANA_RPC_URL, env.SYNAPSE_RPC_URL);
  const aceToken = requireEnv('ACE_API_KEY');
  const databaseUrl = DRY_RUN ? env.DATABASE_URL : requireEnv('DATABASE_URL');
  const agentSecret = DRY_RUN ? env.AGENT_SECRET_KEY_BASE58 : requireEnv('AGENT_SECRET_KEY_BASE58');

  const connection = new Connection(rpcUrl, 'confirmed');
  const agent = agentSecret ? Keypair.fromSecretKey(bs58.decode(agentSecret)) : null;
  const chat = makeAceChat(aceToken);
  const serp = makeAceSerp(aceToken);
  const image = makeAceImage(aceToken);
  const sendConnection = new Connection(resolveSendRpcUrl(env.SOLANA_RPC_URL), 'confirmed');
  const memoWriter = agent ? createSapMemoWriter(createMemoSender(sendConnection, agent)) : null;

  interface UnsafeSql {
    unsafe(q: string, args?: unknown[]): Promise<unknown[]>;
  }
  let db: UnsafeSql | null = null;
  if (databaseUrl) {
    const { SQL } = await import('bun');
    db = new SQL(databaseUrl) as unknown as UnsafeSql;
  }

  console.log(
    `[seed-mint] dry-run=${DRY_RUN} fixtures=${SEED_FIXTURES.length} agent=${agent?.publicKey.toBase58() ?? 'none'}`,
  );

  const results: MintResult[] = [];

  for (const fixture of SEED_FIXTURES) {
    const { kind, identifier, label } = fixture;
    const tone = TONE_MAP[fixture.tone];
    const inputHash = computeInputHash(identifier);

    if (identifier.startsWith('PASTE_')) {
      console.warn(`[skip] ${kind} ${label} — placeholder identifier`);
      results.push({
        fixture,
        inputHash,
        status: 'skipped-placeholder',
        memoSig: null,
      });
      continue;
    }

    // Skip-if-exists check
    if (db) {
      const existing = (await db.unsafe(
        'SELECT input_hash FROM wallet_stories WHERE input_hash = $1 LIMIT 1',
        [inputHash],
      )) as unknown[];
      if (existing.length > 0) {
        console.log(`[skip] ${kind} ${label} — already seeded`);
        results.push({
          fixture,
          inputHash,
          status: 'skipped-exists',
          memoSig: null,
        });
        continue;
      }
    }

    console.log(`[mint] ${kind} ${label} (${identifier.slice(0, 12)}…) tone=${tone}`);

    try {
      const detected = await detectKind(identifier, {
        async getOwner() {
          return null;
        },
      });
      if (detected.kind !== kind) {
        // Kind detection only fully discriminates with on-chain owner lookups;
        // we still trust the operator-supplied kind for seed minting.
        console.warn(`  detector saw kind=${detected.kind}; trusting supplied kind=${kind}`);
      }

      let story: unknown;
      let aceReceipts: string[] = [];

      if (kind === 'wallet') {
        const spotlights = await fetchWalletSpotlights(identifier, buildWalletRpc(connection));
        const out = await renderStory(spotlights, 'wallet', tone, { chat, image });
        story = out.story;
        aceReceipts = out.receipts.map(receiptId);
      } else if (kind === 'tx') {
        const spotlights = await fetchTxSpotlights(identifier, buildTxRpc(rpcUrl));
        const out = await renderTxStory(spotlights, tone, { chat, image, serp });
        story = out.story;
        aceReceipts = out.receipts.map(receiptId);
      } else if (kind === 'nft') {
        const spotlights = await fetchNftSpotlights(identifier, buildNftRpc(rpcUrl));
        const out = await renderNftStory(spotlights, tone, { chat, image });
        story = out.story;
        aceReceipts = out.receipts.map(receiptId);
      } else {
        const spotlights = await fetchTokenSpotlights(
          identifier,
          buildTokenSource(rpcUrl, connection),
        );
        const out = await renderTokenStory(spotlights, tone, { chat, image, serp });
        story = out.story;
        aceReceipts = out.receipts.map(receiptId);
      }

      if (DRY_RUN) {
        console.log(`  ✓ rendered (dry-run — no persist/memo)`);
        results.push({ fixture, inputHash, status: 'minted', memoSig: null });
        continue;
      }

      if (!db) throw new Error('DATABASE_URL required for non-dry-run');
      await db.unsafe(
        `INSERT INTO wallet_stories (input_hash, input, story, provenance)
         VALUES ($1, $2, $3::jsonb, 'seed')
         ON CONFLICT (input_hash) DO NOTHING`,
        [inputHash, identifier, JSON.stringify(story)],
      );

      if (!memoWriter) throw new Error('AGENT_SECRET_KEY_BASE58 required for memo');
      const storyHash = await hashStory(story);
      const memoSig = await memoWriter.writeMemo({
        inputHash,
        storyHash,
        // Seed mints carry no buyer brief → sha256('') (well-known empty digest).
        briefHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        aceReceipts,
        paymentSig: 'seed', // seed mints have no buyer payment
        timestamp: Date.now(),
      });

      console.log(`  ✓ persisted + memo ${memoSig.slice(0, 12)}…`);
      results.push({ fixture, inputHash, status: 'minted', memoSig });
    } catch (err) {
      const msg = (err as Error).message;
      console.error(`  ✗ failed: ${msg}`);
      results.push({ fixture, inputHash, status: 'failed', memoSig: null, error: msg });
    }
  }

  console.log('\n[seed-mint] summary');
  for (const r of results) {
    const memo = r.memoSig ? r.memoSig.slice(0, 12) : '—';
    const err = r.error ? ` (${r.error})` : '';
    console.log(
      `  ${r.status.padEnd(20)} ${r.fixture.kind.padEnd(6)} ${r.fixture.label} memo=${memo}${err}`,
    );
  }

  const failed = results.filter((r) => r.status === 'failed').length;
  if (failed > 0) {
    process.exitCode = 1;
  }
}

function receiptId(r: Receipt): string {
  if (r.kind === 'llm') return `llm:${r.model ?? 'unknown'}`;
  if (r.kind === 'image') return `image:${r.model ?? 'unknown'}`;
  if (r.kind === 'serp') return `serp:${r.query ?? ''}:${r.snippetCount ?? 0}`;
  return `${r.kind}:${r.provider}`;
}

main().catch((err) => {
  console.error('[seed-mint] fatal:', err);
  process.exit(1);
});
