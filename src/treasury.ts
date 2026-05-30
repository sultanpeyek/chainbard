// Treasury preflight + funds-exhaustion detection for the x402 paid-call rail.
//
// The agent is the fee-payer/broadcaster for x402 SPL transfers, so it can run
// dry on either USDC (the payment token) or SOL (fees/rent). When that happens
// the on-chain program / RPC surfaces a grab-bag of error shapes. isFundsExhausted
// normalises across them (and across an arbitrary err.cause chain) so the curator
// can flip the agent dormant instead of looping on a doomed tick.

export class FundsExhaustedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'FundsExhaustedError';
  }
}

const EXHAUSTED_NAMES = new Set([
  'FundsExhaustedError',
  'InsufficientBalanceError',
  'ResourceDisabledError',
]);

const EXHAUSTED_PATTERNS: RegExp[] = [
  /insufficient (funds|lamports|balance|usdc|sol)/i,
  /custom program error: 0x1\b/i,
  /\b0x1\b/,
  // SPL Token InsufficientFunds (error code 1). When a transfer is broadcast
  // with skipPreflight it confirms with `value.err = {InstructionError:[i,{Custom:1}]}`,
  // which JSON.stringifies to this shape (the human-readable `0x1` form never
  // appears). This is the DOMINANT funds-exhaustion path for the USDC rail.
  /"Custom":\s*1\b/,
  /\bInsufficientFunds\b/,
  /debit an account but found no record/i,
  /attempt to debit/i,
  /InsufficientFundsForRent/i,
  /no record of a prior credit/i,
];

function matchesExhausted(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) {
    // Plain string errors still carry signal.
    return typeof err === 'string' && EXHAUSTED_PATTERNS.some((re) => re.test(err));
  }
  const name = (err as { name?: unknown }).name;
  if (typeof name === 'string' && EXHAUSTED_NAMES.has(name)) return true;
  const message = (err as { message?: unknown }).message;
  if (typeof message === 'string' && EXHAUSTED_PATTERNS.some((re) => re.test(message))) {
    return true;
  }
  return false;
}

/**
 * True if `err` — or anything reachable from it — looks like the agent has run
 * out of USDC or SOL. Matches by error name or message pattern, walking the
 * standard `.cause` chain AND the non-standard wrappers we actually throw:
 * `AceChatJsonError.cause1/cause2` (the dominant paid path goes through chat,
 * which buries the SDK error there) and `AggregateError.errors`.
 */
export function isFundsExhausted(err: unknown): boolean {
  const seen = new Set<unknown>();
  const queue: unknown[] = [err];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || current === null || seen.has(current)) continue;
    seen.add(current);
    if (matchesExhausted(current)) return true;
    if (typeof current === 'object') {
      const node = current as {
        cause?: unknown;
        cause1?: unknown;
        cause2?: unknown;
        errors?: unknown;
      };
      queue.push(node.cause, node.cause1, node.cause2);
      if (Array.isArray(node.errors)) queue.push(...node.errors);
    }
  }
  return false;
}
