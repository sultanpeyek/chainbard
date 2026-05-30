import { createHash } from 'node:crypto';
import type { NftStory, TokenStory, TxStory, WalletStory } from '@/story-renderer';

export type Provenance = 'buyer' | 'curator' | 'seed' | 'demo';

/** Any rendered story kind — discriminated by `.kind`. The DB table (jsonb) holds all shapes. */
export type AnyStory = WalletStory | TxStory | NftStory | TokenStory;

export interface WalletStoryRow {
  inputHash: string;
  input: string;
  story: AnyStory;
  provenance: Provenance;
  createdAt: Date;
  memoSig?: string | null;
  paymentSig?: string | null;
  /** Raw buyer brief that steered the render (provenance/audit only; never part of identity). */
  brief?: string | null;
  /** sha256 of the brief (empty brief hashes to the well-known empty-string digest). */
  briefHash?: string | null;
}

export interface MintReceipts {
  memoSig: string;
  paymentSig: string;
}

/** Media-attach patch (ADR 0016 D) — only set fields that were generated. */
export interface MediaPatch {
  videoUrl?: string;
  videoProvider?: string;
  audioUrl?: string;
  audioProvider?: string;
}

export interface StoryRepo {
  getByInputHash(inputHash: string): Promise<WalletStoryRow | null>;
  /**
   * Most-recent stories for the public gallery / home feed. Excludes
   * `provenance='demo'` so demo runs stay isolated from real volume; the
   * direct share page (`/[input]`) still resolves them by hash.
   */
  listRecent(limit: number): Promise<WalletStoryRow[]>;
  upsert(row: Omit<WalletStoryRow, 'createdAt'>): Promise<void>;
  attachReceipts(inputHash: string, receipts: MintReceipts): Promise<void>;
  /**
   * Merge generated media urls into the persisted story jsonb (ADR 0016 D). The
   * durable media-attach job calls this AFTER the story is already published, so
   * it patches the existing row in place rather than re-upserting the whole story.
   * A no-op patch (no generated media) does nothing.
   */
  patchMedia(inputHash: string, patch: MediaPatch): Promise<void>;
}

export type SqlQueryFn = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown[]>;

export function computeInputHash(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function createSqlRepo(sql: SqlQueryFn): StoryRepo {
  return {
    async getByInputHash(inputHash: string): Promise<WalletStoryRow | null> {
      const rows = await sql`
        SELECT input_hash as "inputHash", input, story, provenance, created_at as "createdAt",
               memo_sig as "memoSig", payment_sig as "paymentSig",
               brief, brief_hash as "briefHash"
        FROM wallet_stories
        WHERE input_hash = ${inputHash}
        LIMIT 1
      `;
      const raw = rows[0] as Record<string, unknown> | undefined;
      if (!raw) return null;
      return {
        inputHash: raw.inputHash as string,
        input: raw.input as string,
        story: (typeof raw.story === 'string' ? JSON.parse(raw.story) : raw.story) as AnyStory,
        provenance: raw.provenance as Provenance,
        createdAt: raw.createdAt as Date,
        memoSig: (raw.memoSig as string | null | undefined) ?? null,
        paymentSig: (raw.paymentSig as string | null | undefined) ?? null,
        brief: (raw.brief as string | null | undefined) ?? null,
        briefHash: (raw.briefHash as string | null | undefined) ?? null,
      };
    },

    async listRecent(limit: number): Promise<WalletStoryRow[]> {
      const rows = await sql`
        SELECT input_hash as "inputHash", input, story, provenance, created_at as "createdAt",
               memo_sig as "memoSig", payment_sig as "paymentSig",
               brief, brief_hash as "briefHash"
        FROM wallet_stories
        WHERE provenance <> 'demo'
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
      return (rows as Record<string, unknown>[]).map((raw) => ({
        inputHash: raw.inputHash as string,
        input: raw.input as string,
        story: (typeof raw.story === 'string' ? JSON.parse(raw.story) : raw.story) as AnyStory,
        provenance: raw.provenance as Provenance,
        createdAt: raw.createdAt as Date,
        memoSig: (raw.memoSig as string | null | undefined) ?? null,
        paymentSig: (raw.paymentSig as string | null | undefined) ?? null,
        brief: (raw.brief as string | null | undefined) ?? null,
        briefHash: (raw.briefHash as string | null | undefined) ?? null,
      }));
    },

    async upsert({
      inputHash,
      input,
      story,
      provenance,
      brief,
      briefHash,
    }: Omit<WalletStoryRow, 'createdAt'>): Promise<void> {
      await sql`
        INSERT INTO wallet_stories (input_hash, input, story, provenance, brief, brief_hash)
        VALUES (${inputHash}, ${input}, ${JSON.stringify(story)}, ${provenance}, ${brief ?? null}, ${briefHash ?? null})
        ON CONFLICT (input_hash) DO UPDATE
          SET story = EXCLUDED.story, provenance = EXCLUDED.provenance,
              brief = EXCLUDED.brief, brief_hash = EXCLUDED.brief_hash
      `;
    },

    async attachReceipts(inputHash: string, { memoSig, paymentSig }: MintReceipts): Promise<void> {
      await sql`
        UPDATE wallet_stories
        SET memo_sig = ${memoSig}, payment_sig = ${paymentSig}
        WHERE input_hash = ${inputHash}
      `;
    },

    async patchMedia(inputHash: string, patch: MediaPatch): Promise<void> {
      // Drop undefined keys so a missing leg (e.g. video succeeded, audio didn't)
      // never overwrites an existing url with null. A wholly-empty patch is a no-op.
      const merge = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      if (Object.keys(merge).length === 0) return;
      // jsonb `||` shallow-merges the patch object into the existing story jsonb,
      // setting/overwriting only the supplied media keys.
      await sql`
        UPDATE wallet_stories
        SET story = story || ${JSON.stringify(merge)}::jsonb
        WHERE input_hash = ${inputHash}
      `;
    },
  };
}
