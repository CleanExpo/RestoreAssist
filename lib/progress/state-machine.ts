/**
 * Progress state machine — pure functions, no I/O.
 *
 * Board reference: .claude/board-2026-04-18/05-software-architect.md §3
 *                  .claude/board-2026-04-18/00-board-minutes.md §5
 *
 * Everything in this file is unit-testable in isolation.
 * Service layer (service.ts) calls these guards before committing a transition.
 */

import type { ClaimState } from "@prisma/client";

/**
 * Legal transition keys. Each maps to one or more (fromState → toState) edges.
 * A transition key may appear in multiple edges only if the semantics are
 * unambiguous given the fromState.
 */
export const TRANSITION_KEYS = [
  "start_stabilisation",
  "attest_stabilisation",
  "whs_incident_raised",
  "whs_cleared",
  "begin_scope",
  "approve_scope",
  "commence_drying",
  "raise_variation",
  "variation_approved",
  "variation_rejected",
  "certify_drying",
  "initiate_closeout",
  "issue_invoice",
  "reopen_drying",
  "record_payment",
  "raise_dispute",
  "dispute_resolved",
  "write_off",
  "close_claim",
  "withdraw",
] as const;

export type TransitionKey = (typeof TRANSITION_KEYS)[number];

interface Edge {
  from: ClaimState;
  to: ClaimState;
  key: TransitionKey;
}

/**
 * Full edge list. See Architect paper §3 for the diagram.
 * withdraw is modelled as a single key that can be applied from any
 * non-terminal state; it's expanded programmatically in isValidTransition.
 */
const EDGES: Edge[] = [
  { from: "INTAKE", to: "STABILISATION_ACTIVE", key: "start_stabilisation" },
  {
    from: "STABILISATION_ACTIVE",
    to: "STABILISATION_COMPLETE",
    key: "attest_stabilisation",
  },
  { from: "STABILISATION_ACTIVE", to: "WHS_HOLD", key: "whs_incident_raised" },
  { from: "WHS_HOLD", to: "STABILISATION_ACTIVE", key: "whs_cleared" },
  { from: "STABILISATION_COMPLETE", to: "SCOPE_DRAFT", key: "begin_scope" },
  { from: "SCOPE_DRAFT", to: "SCOPE_APPROVED", key: "approve_scope" },
  { from: "SCOPE_APPROVED", to: "DRYING_ACTIVE", key: "commence_drying" },
  { from: "SCOPE_APPROVED", to: "VARIATION_REVIEW", key: "raise_variation" },
  { from: "DRYING_ACTIVE", to: "VARIATION_REVIEW", key: "raise_variation" },
  { from: "VARIATION_REVIEW", to: "SCOPE_APPROVED", key: "variation_approved" },
  { from: "VARIATION_REVIEW", to: "SCOPE_DRAFT", key: "variation_rejected" },
  { from: "DRYING_ACTIVE", to: "DRYING_CERTIFIED", key: "certify_drying" },
  { from: "DRYING_CERTIFIED", to: "CLOSEOUT", key: "initiate_closeout" },
  { from: "CLOSEOUT", to: "INVOICE_ISSUED", key: "issue_invoice" },
  { from: "CLOSEOUT", to: "DRYING_ACTIVE", key: "reopen_drying" },
  { from: "INVOICE_ISSUED", to: "INVOICE_PAID", key: "record_payment" },
  { from: "INVOICE_ISSUED", to: "DISPUTED", key: "raise_dispute" },
  { from: "DISPUTED", to: "INVOICE_ISSUED", key: "dispute_resolved" },
  { from: "DISPUTED", to: "WITHDRAWN", key: "write_off" },
  { from: "INVOICE_PAID", to: "CLOSED", key: "close_claim" },
];

export const TERMINAL_STATES: ClaimState[] = ["CLOSED", "WITHDRAWN"];

export const NON_WITHDRAWABLE_STATES: ClaimState[] = [
  "INVOICE_PAID",
  "CLOSED",
  "WITHDRAWN",
];

/**
 * Is (from, key, to) a valid edge in the state machine?
 * Used by the service layer to reject impossible transitions before
 * consulting guard functions.
 */
export function isValidTransition(
  from: ClaimState,
  key: TransitionKey,
  to: ClaimState,
): boolean {
  // `withdraw` is universal from any non-terminal, non-disputed pre-payment state.
  if (key === "withdraw") {
    return to === "WITHDRAWN" && !NON_WITHDRAWABLE_STATES.includes(from);
  }
  return EDGES.some((e) => e.from === from && e.key === key && e.to === to);
}

/**
 * Compute the next state for (from, key). Returns null if the key is not valid
 * from this state. Used by the service layer as the source of truth for the
 * resulting state when the caller only supplies a transition key.
 */
export function nextState(
  from: ClaimState,
  key: TransitionKey,
): ClaimState | null {
  if (key === "withdraw") {
    return NON_WITHDRAWABLE_STATES.includes(from) ? null : "WITHDRAWN";
  }
  const edge = EDGES.find((e) => e.from === from && e.key === key);
  return edge?.to ?? null;
}

/**
 * All transition keys legal from a given state. Used for UI button-disable
 * logic and for permission enumeration.
 */
export function legalKeysFrom(from: ClaimState): TransitionKey[] {
  const keys = new Set<TransitionKey>(
    EDGES.filter((e) => e.from === from).map((e) => e.key),
  );
  if (!NON_WITHDRAWABLE_STATES.includes(from)) {
    keys.add("withdraw");
  }
  return [...keys];
}

/**
 * Is a state re-entrant (can be returned to from a later state)? Useful for
 * UI to show loopback arrows and for tests.
 */
export function isReEntrant(state: ClaimState): boolean {
  const reEntrantTargets = new Set<ClaimState>();
  for (const e of EDGES) {
    if (e.from !== e.to) {
      const laterEdgeBack = EDGES.find(
        (e2) => e2.from === e.to && e2.to === e.from,
      );
      if (laterEdgeBack) reEntrantTargets.add(e.to);
    }
  }
  return reEntrantTargets.has(state);
}

/**
 * Guard-function shape. Each transition key has an associated guard that
 * verifies database-level preconditions before the transition commits.
 * Guards are async because they read the DB.
 *
 * Signature is kept deliberately simple: take a claimProgress + DB client,
 * return an object describing whether the guard passed and what evidence
 * was captured.
 *
 * Actual guard implementations live in service.ts — this file stays pure.
 */
export interface GuardResult {
  passed: boolean;
  reason?: string;
  /** JSON snapshot of the evidence verified. Stored on ProgressTransition. */
  snapshot: Record<string, unknown>;
}

export type GuardFn = (ctx: {
  claimProgressId: string;
  reportId: string;
  inspectionId: string | null;
  fromState: ClaimState;
  toState: ClaimState;
  key: TransitionKey;
  /**
   * Injected by the service layer — a narrow subset of prisma we need.
   * Kept abstract so this file does not depend on @prisma/client at runtime.
   */
  db: unknown;
}) => Promise<GuardResult>;
