import { env } from '@/env';

const DEFAULT_CAP_USDC = env.DAILY_ACE_CAP_USDC;

// Estimated USDC cost per story render (1 LLM call + 1 Midjourney image).
// Tune via ACE_COST_PER_RENDER_USDC env var.
export const RENDER_COST_USDC = env.ACE_COST_PER_RENDER_USDC;

export class CostCapExceededError extends Error {
  constructor(
    public readonly spent: number,
    public readonly cap: number,
  ) {
    super(`Daily Ace spend cap hit: $${spent.toFixed(4)} of $${cap.toFixed(2)} USDC`);
    this.name = 'CostCapExceededError';
  }
}

export interface Clock {
  nowMs(): number;
}

interface DayState {
  dateKey: string; // YYYY-MM-DD UTC
  spentUsdc: number;
}

export class CostGuard {
  private state: DayState;

  constructor(
    private readonly capUsdc: number = DEFAULT_CAP_USDC,
    private readonly clock: Clock = { nowMs: () => Date.now() },
  ) {
    this.state = { dateKey: this.todayKey(), spentUsdc: 0 };
  }

  private todayKey(): string {
    return new Date(this.clock.nowMs()).toISOString().slice(0, 10);
  }

  private maybeReset(): void {
    const today = this.todayKey();
    if (this.state.dateKey !== today) {
      this.state = { dateKey: today, spentUsdc: 0 };
    }
  }

  check(): { ok: boolean; spent: number; cap: number } {
    this.maybeReset();
    const { spentUsdc } = this.state;
    return { ok: spentUsdc < this.capUsdc, spent: spentUsdc, cap: this.capUsdc };
  }

  guardOrThrow(): void {
    const status = this.check();
    if (!status.ok) {
      console.error('[cost-guard] daily cap hit — aborting paid call');
      throw new CostCapExceededError(status.spent, status.cap);
    }
  }

  increment(amountUsdc: number): void {
    this.maybeReset();
    this.state.spentUsdc += amountUsdc;
  }

  get spent(): number {
    this.maybeReset();
    return this.state.spentUsdc;
  }
}

// Singleton shared across reactive renders and autonomous ticks.
// Uses in-memory storage — counter is lost on process restart.
// Durable persistence (KV / Postgres) is a follow-up tracked in the issue.
// Always-on (ADR 0016 G): a hardcoded daily cap as a cheap runaway breaker; the
// agent wallet's USDC balance remains the real ceiling.
export const defaultCostGuard = new CostGuard(DEFAULT_CAP_USDC);
