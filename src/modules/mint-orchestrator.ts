/**
 * Mint-orchestrator state machine for reactive (buyer-paid) wallet renders.
 *
 * Simplified from `_prototype/mint-machine` — drops SAP escrow legs since
 * `settle_calls_v2` is broken upstream on deployed v0.18 (see project memory
 * `sap-sdk-idl-mismatch`). The buyer pays via a single USDC TransferChecked
 * verified by the AceData facilitator flow; we settle nothing on chain
 * besides the SPL Memo receipt.
 *
 * Idempotency key: `(inputHash, buyerPubkey, paymentSig)`. Re-invoking with
 * the same key resumes at the next unfinished step; finished steps are
 * never re-executed.
 */

import { createHash } from 'node:crypto';
import type { AceChatLike } from '@/lib/ace-chat-json';
import type { Kind, Plan, Spotlights } from '@/modules/director';
import type { WalletStory } from '@/story-renderer';
import type { VerifierReason, X402Verifier } from './x402-verifier';

export type MintState =
  | 'quote'
  | 'awaitingPayment'
  | 'paymentVerified'
  | 'fetchingSpotlights'
  | 'callingAce'
  | 'persisting'
  | 'postingMemo'
  | 'published'
  | 'refundable'
  | 'retryable'
  | 'fatal';

export type FailureClass = 'refundable' | 'retryable' | 'fatal';

export interface MintEffects<S = unknown> {
  spotlights?: S;
  /** Director-emitted Plan, present only when the run carried a brief. */
  plan?: Plan;
  story?: WalletStory;
  aceReceipts?: string[];
  dbRecordId?: string;
  memoSig?: string;
  memoWrittenAt?: number;
}

export interface MintContext<S = unknown> {
  inputHash: string;
  input: string;
  buyer: string;
  paymentSig: string;
  state: MintState;
  effects: MintEffects<S>;
  failureReason?: string;
  /** Verifier reason, if payment verification failed. */
  verifierReason?: VerifierReason;
}

export interface MintRunStore<S = unknown> {
  get(key: string): Promise<MintContext<S> | null>;
  put(key: string, ctx: MintContext<S>): Promise<void>;
}

export function mintKey(inputHash: string, buyer: string, paymentSig: string): string {
  return `${inputHash}:${buyer}:${paymentSig}`;
}

export interface MintRenderResult {
  story: WalletStory;
  aceReceipts: string[];
}

/**
 * `RetryableError` and `FatalError` are honoured by the orchestrator's error
 * classification: thrown by deps to push the run into the matching terminal
 * state. Any other thrown error is treated as `retryable` by default (safer
 * than corrupting the run with a fatal classification).
 */
export class RetryableError extends Error {}
export class FatalError extends Error {}

/**
 * Orchestrator-owned progress step ids (NDJSON contract). `write`/`paint`/`search`
 * are emitted by the renderer itself (see story-renderer `RenderProgress`); the
 * orchestrator owns the surrounding `facts`/`save`/`memo` seams. `done` for
 * `memo` carries the memo signature.
 */
export type MintStepId = 'direct' | 'facts' | 'save' | 'memo';
export type MintProgress = (id: MintStepId, status: 'active' | 'done', sig?: string) => void;

const noopProgress: MintProgress = () => {};

export interface MintDeps<S = unknown> {
  verifier: X402Verifier;
  fetchSpotlights(input: string): Promise<S>;
  render(args: { input: string; spotlights: S; plan?: Plan }): Promise<MintRenderResult>;
  /**
   * Buyer-brief Director. Optional + injected for testability; matches
   * `runDirector(spotlights, brief, kind, ace)`. Only invoked when the run
   * carries a non-empty brief (see `RunArgs.brief`).
   */
  director?(spotlights: Spotlights, brief: string, kind: Kind, ace: AceChatLike): Promise<Plan>;
  /** Raw Ace facade passed straight through to `director`. */
  ace?: AceChatLike;
  persistStory(args: {
    inputHash: string;
    input: string;
    story: WalletStory;
    buyer: string;
    paymentSig: string;
  }): Promise<{ id: string }>;
  memoWriter: { writeMemo(args: import('./sap-memo-writer').MemoArgs): Promise<string> };
  hashStory(story: WalletStory): string;
  now(): number;
  /** Optional progress emitter; noop by default so pure-core/tests stay green. */
  onProgress?: MintProgress;
}

export interface RunArgs {
  input: string;
  buyer: string;
  paymentSig: string;
  inputHash: string;
  expectedMint: string;
  expectedAmount: bigint;
  expectedDestAta: string;
  /** Untrusted buyer brief. Empty/whitespace => no Director call, default flow. */
  brief?: string;
  /** Story kind, passed to the Director. Defaults to `'wallet'`. */
  kind?: Kind;
}

function classify(err: unknown): FailureClass {
  if (err instanceof FatalError) return 'fatal';
  return 'retryable';
}

export async function runMintFlow<S>(
  deps: MintDeps<S>,
  store: MintRunStore<S>,
  args: RunArgs,
): Promise<MintContext<S>> {
  const onProgress = deps.onProgress ?? noopProgress;
  const brief = args.brief ?? '';
  const hasBrief = brief.trim().length > 0;
  const briefHash = createHash('sha256').update(brief).digest('hex');
  const key = mintKey(args.inputHash, args.buyer, args.paymentSig);
  let ctx: MintContext<S> = (await store.get(key)) ?? {
    inputHash: args.inputHash,
    input: args.input,
    buyer: args.buyer,
    paymentSig: args.paymentSig,
    state: 'awaitingPayment',
    effects: {},
  };

  // Terminal states are honoured as-is. Resume re-runs only from the first
  // unfinished step; we never re-execute a step whose effect is recorded.

  if (ctx.state === 'published' || ctx.state === 'fatal' || ctx.state === 'refundable') {
    return ctx;
  }

  // Step 1: verify payment (skip if already verified).
  if (ctx.state === 'awaitingPayment' || ctx.state === 'quote' || ctx.state === 'retryable') {
    const result = await deps.verifier.verifyPayment({
      signature: args.paymentSig,
      expectedBuyer: args.buyer,
      expectedMint: args.expectedMint,
      expectedAmount: args.expectedAmount,
      expectedDestAta: args.expectedDestAta,
    });
    if (!result.ok) {
      ctx = {
        ...ctx,
        state: 'refundable',
        verifierReason: result.reason,
        failureReason: `payment verifier rejected: ${result.reason}`,
      };
      await store.put(key, ctx);
      return ctx;
    }
    ctx = { ...ctx, state: 'paymentVerified' };
    await store.put(key, ctx);
  }

  // Step 2: fetch spotlights (skip if already fetched).
  if (ctx.state === 'paymentVerified' && !ctx.effects.spotlights) {
    ctx = { ...ctx, state: 'fetchingSpotlights' };
    await store.put(key, ctx);
    onProgress('facts', 'active');
    try {
      const spotlights = await deps.fetchSpotlights(args.input);
      ctx = {
        ...ctx,
        effects: { ...ctx.effects, spotlights },
      };
      await store.put(key, ctx);
      onProgress('facts', 'done');
    } catch (err) {
      ctx = {
        ...ctx,
        state: classify(err),
        failureReason: `fetchSpotlights failed: ${(err as Error).message}`,
      };
      await store.put(key, ctx);
      return ctx;
    }
  }

  // Step 2.5: Director (only when the buyer supplied a brief). Runs AFTER
  // spotlights are fetched so it grounds on the real on-chain truth — the
  // brief steers voice/angle only and can never override a fact. Emits the
  // `direct` step after `facts`, before the render. An empty brief skips this
  // entirely so today's flow stays byte-identical. Resume-safe: skips if a
  // Plan is already recorded. `runDirector` never throws (returns a clean
  // default on any model failure), so no failure branch is needed.
  if (hasBrief && deps.director && deps.ace && ctx.effects.spotlights && !ctx.effects.plan) {
    onProgress('direct', 'active');
    const plan = await deps.director(
      ctx.effects.spotlights as unknown as Spotlights,
      brief,
      args.kind ?? 'wallet',
      deps.ace,
    );
    ctx = { ...ctx, effects: { ...ctx.effects, plan } };
    await store.put(key, ctx);
    onProgress('direct', 'done');
  }

  // Step 3: call Ace to render the story.
  if (
    (ctx.state === 'paymentVerified' || ctx.state === 'fetchingSpotlights') &&
    ctx.effects.spotlights &&
    !ctx.effects.story
  ) {
    ctx = { ...ctx, state: 'callingAce' };
    await store.put(key, ctx);
    try {
      const rendered = await deps.render({
        input: args.input,
        spotlights: ctx.effects.spotlights as S,
        plan: ctx.effects.plan,
      });
      ctx = {
        ...ctx,
        effects: {
          ...ctx.effects,
          story: rendered.story,
          aceReceipts: rendered.aceReceipts,
        },
      };
      await store.put(key, ctx);
    } catch (err) {
      ctx = {
        ...ctx,
        state: classify(err),
        failureReason: `render failed: ${(err as Error).message}`,
      };
      await store.put(key, ctx);
      return ctx;
    }
  }

  // Step 4: persist the story.
  const storyForPersist = ctx.effects.story;
  if (storyForPersist && !ctx.effects.dbRecordId) {
    ctx = { ...ctx, state: 'persisting' };
    await store.put(key, ctx);
    onProgress('save', 'active');
    try {
      const { id } = await deps.persistStory({
        inputHash: args.inputHash,
        input: args.input,
        story: storyForPersist,
        buyer: args.buyer,
        paymentSig: args.paymentSig,
      });
      ctx = { ...ctx, effects: { ...ctx.effects, dbRecordId: id } };
      await store.put(key, ctx);
      onProgress('save', 'done');
    } catch (err) {
      ctx = {
        ...ctx,
        state: classify(err),
        failureReason: `persistStory failed: ${(err as Error).message}`,
      };
      await store.put(key, ctx);
      return ctx;
    }
  }

  // Step 5: post SAP Memo v2 receipt.
  if (ctx.effects.dbRecordId && !ctx.effects.memoSig) {
    ctx = { ...ctx, state: 'postingMemo' };
    await store.put(key, ctx);
    onProgress('memo', 'active');
    try {
      if (!ctx.effects.story) throw new FatalError('missing story before memo write');
      const memoSig = await deps.memoWriter.writeMemo({
        inputHash: args.inputHash,
        storyHash: deps.hashStory(ctx.effects.story),
        briefHash,
        aceReceipts: ctx.effects.aceReceipts ?? [],
        paymentSig: args.paymentSig,
        timestamp: deps.now(),
      });
      ctx = {
        ...ctx,
        effects: { ...ctx.effects, memoSig, memoWrittenAt: deps.now() },
      };
      await store.put(key, ctx);
      onProgress('memo', 'done', memoSig);
    } catch (err) {
      ctx = {
        ...ctx,
        state: classify(err),
        failureReason: `writeMemo failed: ${(err as Error).message}`,
      };
      await store.put(key, ctx);
      return ctx;
    }
  }

  // Mark the payment signature as consumed only at the terminal `published`
  // state. This is deferred from verifier.verifyPayment so that retryable
  // failures (RPC 429, transient Ace errors) can resume without tripping the
  // anti-replay guard on the same lambda instance.
  await deps.verifier.markUsed(args.paymentSig);
  ctx = { ...ctx, state: 'published' };
  await store.put(key, ctx);
  return ctx;
}
