/**
 * Stop-guard tracker for the continuous Linear loop (AGENTS.md rule 19).
 *
 * Tracks the 4 stop-guard conditions from the design spec (docs/superpowers/specs/
 * 2026-07-03-continuous-moa-agent-loop-design.md §3 "Stop guards"):
 * 1. 2 consecutive CI (verify) failures on the same issue.
 * 2. Any issue requiring an owner-gated action.
 * 3. A daily token/cost budget ceiling is hit — ceiling is caller-supplied at
 *    construction, never hardcoded here (spec §8 open follow-up).
 * 4. 3+ consecutive issues skipped as unactionable.
 *
 * Mechanism: this is a single in-memory object, not a persisted store. A Claude
 * Code session has no long-running process to host a singleton across cycles —
 * the /loop skill wiring (Task 6 of the implementation plan) re-instantiates a
 * tracker at loop start and threads its current counts through each cycle's
 * dispatch prompt as plain state (JSON-serializable via toState()/fromState()),
 * since each /loop iteration is a fresh prompt turn, not a shared call stack.
 */

export interface StopGuardConfig {
  /** Daily spend ceiling in USD, supplied by the caller at loop invocation. No default. */
  dailyBudgetCeilingUsd: number;
}

export interface StopGuardResult {
  tripped: boolean;
}

interface StopGuardState {
  ciFailuresByIssue: Record<string, number>;
  ownerGatedTripped: boolean;
  cumulativeSpendUsd: number;
  consecutiveUnactionableSkips: number;
  tripReason: string | null;
}

const CI_FAILURE_TRIP_THRESHOLD = 2;
const CONSECUTIVE_SKIP_TRIP_THRESHOLD = 3;

export class StopGuardTracker {
  private readonly dailyBudgetCeilingUsd: number;
  private state: StopGuardState;

  constructor(config: StopGuardConfig) {
    this.dailyBudgetCeilingUsd = config.dailyBudgetCeilingUsd;
    this.state = {
      ciFailuresByIssue: {},
      ownerGatedTripped: false,
      cumulativeSpendUsd: 0,
      consecutiveUnactionableSkips: 0,
      tripReason: null,
    };
  }

  /** Serialize current counters so a fresh /loop cycle prompt can restore them. */
  toState(): StopGuardState {
    return { ...this.state, ciFailuresByIssue: { ...this.state.ciFailuresByIssue } };
  }

  /** Restore counters from a prior cycle's serialized state. */
  static fromState(config: StopGuardConfig, state: StopGuardState): StopGuardTracker {
    const tracker = new StopGuardTracker(config);
    tracker.state = { ...state, ciFailuresByIssue: { ...state.ciFailuresByIssue } };
    return tracker;
  }

  recordCiFailure(issueId: string): StopGuardResult {
    const count = (this.state.ciFailuresByIssue[issueId] ?? 0) + 1;
    this.state.ciFailuresByIssue[issueId] = count;
    if (count >= CI_FAILURE_TRIP_THRESHOLD) {
      this.state.tripReason = `${issueId}: 2 consecutive CI failures`;
      return { tripped: true };
    }
    return { tripped: false };
  }

  recordOwnerGated(): StopGuardResult {
    this.state.ownerGatedTripped = true;
    this.state.tripReason = "issue requires an owner-gated action";
    return { tripped: true };
  }

  recordSpend(usd: number): StopGuardResult {
    this.state.cumulativeSpendUsd += usd;
    if (this.state.cumulativeSpendUsd >= this.dailyBudgetCeilingUsd) {
      this.state.tripReason = `cumulative spend $${this.state.cumulativeSpendUsd.toFixed(
        2
      )} reached the daily budget ceiling of $${this.dailyBudgetCeilingUsd.toFixed(2)}`;
      return { tripped: true };
    }
    return { tripped: false };
  }

  recordUnactionableSkip(): StopGuardResult {
    this.state.consecutiveUnactionableSkips += 1;
    if (this.state.consecutiveUnactionableSkips >= CONSECUTIVE_SKIP_TRIP_THRESHOLD) {
      this.state.tripReason = `${this.state.consecutiveUnactionableSkips} consecutive issues skipped as unactionable`;
      return { tripped: true };
    }
    return { tripped: false };
  }

  /** Call after any cycle that opens a PR (an actionable, non-skipped cycle). */
  recordActionableCycle(): void {
    this.state.consecutiveUnactionableSkips = 0;
    this.state.ciFailuresByIssue = {};
  }

  getTripReason(): string | null {
    return this.state.tripReason;
  }
}
