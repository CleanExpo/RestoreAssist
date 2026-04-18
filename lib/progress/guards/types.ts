/**
 * Guard function shape for the Progress state machine.
 *
 * Each transition key has a registered guard. The guard reads the DB
 * and verifies the Stage × Required Evidence contract from
 * .claude/board-2026-04-18/00-board-minutes.md §5.2 before the
 * transition is allowed to commit.
 *
 * Guards are pure-ish: they take a prisma-shaped client and the
 * transition context, return a structured result. No side effects.
 */

import type { ClaimState } from "@prisma/client";
import type { TransitionKey } from "../state-machine";

export interface GuardContext {
  claimProgressId: string;
  reportId: string;
  inspectionId: string | null;
  fromState: ClaimState;
  toState: ClaimState;
  key: TransitionKey;
}

export interface GuardResult {
  /** true → transition may proceed */
  passed: boolean;
  /** Human-readable reason, surfaced to the caller on failure. */
  reason?: string;
  /**
   * JSON of evidence entities verified at guard time. Stored on
   * ProgressTransition.guardSnapshot for audit defence — "at the moment
   * we advanced, these rows existed and satisfied the contract".
   */
  snapshot: Record<string, unknown>;
}

/**
 * Guard function. Takes a prisma client (narrowly typed to the subset
 * we need — see individual guard files) and a context. Returns async.
 */
export type GuardFn = (db: unknown, ctx: GuardContext) => Promise<GuardResult>;
