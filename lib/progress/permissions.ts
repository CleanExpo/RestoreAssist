/**
 * permissions.ts — M-3 (RA-1379)
 *
 * Authorisation contract for the Progress framework.
 * `canPerformTransition(role, state, transitionKey)` is the single gate every
 * state change flows through (M-21 Sprint 1 `service.ts` calls it; UI
 * `<TransitionButton>` also calls it for progressive disclosure per principle 5).
 *
 * Source of truth: board minutes §5.3 RACI (pending PC2 to push).
 *
 * INTERIM: this module ships a CONSERVATIVE-DEFAULT matrix so Sprint 1 can
 * build against a real API surface. When board-minutes §5.3 lands on main,
 * a follow-up PR swaps `ROLE_TRANSITION_MATRIX` and updates the expected-
 * pass/fail cells in the test file — the API shape stays stable.
 *
 * Rules of the conservative default:
 *   - ADMIN: can perform every transition from any state.
 *   - MANAGER: can perform every transition except `resolve_dispute`,
 *     `close`, and `withdraw` (finality decisions held at ADMIN).
 *   - USER (technician): can perform evidence-capture attestations only —
 *     `attest_stabilisation`, `attest_whs_hazard`, `attest_whs_cleared`,
 *     `commence_drying`, `certify_drying`. Cannot submit scope, authorise,
 *     invoice, or close.
 *   - JUNIOR_TECHNICIAN: zero transitions — evidence-only per M-16
 *     ring-fence. Juniors contribute evidence via the attestation capture
 *     UI but never promote stages.
 *   - SUBCONTRACTOR, LABOUR_HIRE: zero transitions until M-13
 *     labour-hire attestation schema lands (they'll get a scoped subset then).
 *
 * No bare `false` returns — every negative decision carries a human-readable
 * `reason` so the UI can display it (principle 3: surface what + why, never
 * generic "blocked").
 */

/** Every `ClaimState` value from the M-5 Prisma enum. String-typed here to
 *  avoid a hard Prisma import — the service layer is the boundary that
 *  narrows to the generated enum. */
export type ClaimState =
  | "INTAKE"
  | "STABILISATION_ACTIVE"
  | "WHS_HOLD"
  | "STABILISATION_COMPLETE"
  | "SCOPE_DRAFT"
  | "SCOPE_APPROVED"
  | "DRYING_ACTIVE"
  | "VARIATION_REVIEW"
  | "DRYING_CERTIFIED"
  | "CLOSEOUT"
  | "INVOICE_ISSUED"
  | "INVOICE_PAID"
  | "DISPUTED"
  | "CLOSED"
  | "WITHDRAWN";

/** Canonical transition keys from `.claude/board-2026-04-18/progress-framework.md`. */
export type TransitionKey =
  | "attest_stabilisation"
  | "attest_whs_hazard"
  | "attest_whs_cleared"
  | "submit_scope"
  | "carrier_authorise"
  | "carrier_authorise_variation"
  | "commence_drying"
  | "certify_drying"
  | "commence_closeout"
  | "issue_invoice"
  | "record_payment"
  | "dispute"
  | "resolve_dispute"
  | "withdraw"
  | "close";

/**
 * Actor roles. The first three map 1-1 to the existing Prisma `Role` enum
 * (ADMIN / MANAGER / USER). The last three are attestor-role strings used in
 * `ProgressAttestation.attestorRole` (M-5 schema field) — they are NOT
 * values of the Prisma Role enum; they describe the person's relationship
 * to the job regardless of their platform login role.
 */
export type ActorRole =
  | "ADMIN"
  | "MANAGER"
  | "USER"
  | "JUNIOR_TECHNICIAN"
  | "SUBCONTRACTOR"
  | "LABOUR_HIRE";

export interface PermissionResult {
  ok: boolean;
  /** Always populated so the UI has something to display — principle 3. */
  reason: string;
}

/**
 * Conservative-default matrix. Reading: `role → set of transitionKeys allowed`.
 * When board minutes §5.3 lands, this table is the only thing that changes;
 * callers + tests stay stable.
 */
const ROLE_TRANSITION_MATRIX: Record<ActorRole, ReadonlySet<TransitionKey>> = {
  ADMIN: new Set<TransitionKey>([
    "attest_stabilisation",
    "attest_whs_hazard",
    "attest_whs_cleared",
    "submit_scope",
    "carrier_authorise",
    "carrier_authorise_variation",
    "commence_drying",
    "certify_drying",
    "commence_closeout",
    "issue_invoice",
    "record_payment",
    "dispute",
    "resolve_dispute",
    "withdraw",
    "close",
  ]),
  MANAGER: new Set<TransitionKey>([
    "attest_stabilisation",
    "attest_whs_hazard",
    "attest_whs_cleared",
    "submit_scope",
    "carrier_authorise",
    "carrier_authorise_variation",
    "commence_drying",
    "certify_drying",
    "commence_closeout",
    "issue_invoice",
    "record_payment",
    "dispute",
    // Finality — held at ADMIN for conservative default:
    //   "resolve_dispute", "withdraw", "close"
  ]),
  USER: new Set<TransitionKey>([
    // Evidence-capture attestations only.
    "attest_stabilisation",
    "attest_whs_hazard",
    "attest_whs_cleared",
    "commence_drying",
    "certify_drying",
  ]),
  JUNIOR_TECHNICIAN: new Set<TransitionKey>(),
  SUBCONTRACTOR: new Set<TransitionKey>(),
  LABOUR_HIRE: new Set<TransitionKey>(),
};

/**
 * Valid (from-state × transitionKey) pairs. Prevents an ADMIN from, e.g.,
 * issuing an invoice before closeout, or certifying drying before drying has
 * commenced. This is the M-1 framework's state machine encoded.
 */
const TRANSITION_FROM_STATES: Record<TransitionKey, ReadonlySet<ClaimState>> = {
  attest_stabilisation:        new Set<ClaimState>(["STABILISATION_ACTIVE"]),
  attest_whs_hazard:           new Set<ClaimState>(["STABILISATION_ACTIVE", "DRYING_ACTIVE"]),
  attest_whs_cleared:          new Set<ClaimState>(["WHS_HOLD"]),
  submit_scope:                new Set<ClaimState>(["STABILISATION_COMPLETE"]),
  carrier_authorise:           new Set<ClaimState>(["SCOPE_DRAFT"]),
  carrier_authorise_variation: new Set<ClaimState>(["VARIATION_REVIEW"]),
  commence_drying:             new Set<ClaimState>(["SCOPE_APPROVED", "VARIATION_REVIEW"]),
  certify_drying:              new Set<ClaimState>(["DRYING_ACTIVE"]),
  commence_closeout:           new Set<ClaimState>(["DRYING_CERTIFIED"]),
  issue_invoice:               new Set<ClaimState>(["CLOSEOUT"]),
  record_payment:              new Set<ClaimState>(["INVOICE_ISSUED", "DISPUTED"]),
  dispute:                     new Set<ClaimState>(["INVOICE_ISSUED"]),
  resolve_dispute:             new Set<ClaimState>(["DISPUTED"]),
  withdraw:                    new Set<ClaimState>([
    // Withdrawal is valid from any non-terminal state.
    "INTAKE",
    "STABILISATION_ACTIVE",
    "WHS_HOLD",
    "STABILISATION_COMPLETE",
    "SCOPE_DRAFT",
    "SCOPE_APPROVED",
    "DRYING_ACTIVE",
    "VARIATION_REVIEW",
    "DRYING_CERTIFIED",
    "CLOSEOUT",
    "INVOICE_ISSUED",
    "DISPUTED",
  ]),
  close:                       new Set<ClaimState>(["INVOICE_PAID"]),
};

/**
 * The single authorisation gate for every state transition. Callers are:
 *   - `lib/progress/service.ts::transition()` (server-side enforcement)
 *   - `<TransitionButton>` client component (progressive disclosure)
 *
 * Returns a structured result so the UI can surface the specific reason
 * rather than a generic "not allowed" (principle 3).
 */
export function canPerformTransition(
  role: ActorRole,
  state: ClaimState,
  transitionKey: TransitionKey,
): PermissionResult {
  const allowedFromStates = TRANSITION_FROM_STATES[transitionKey];
  if (!allowedFromStates) {
    return {
      ok: false,
      reason: `Unknown transition key '${transitionKey}'.`,
    };
  }
  if (!allowedFromStates.has(state)) {
    return {
      ok: false,
      reason:
        `Transition '${transitionKey}' is not valid from state '${state}'. ` +
        `Valid from: ${[...allowedFromStates].sort().join(", ")}.`,
    };
  }

  const allowedForRole = ROLE_TRANSITION_MATRIX[role];
  if (!allowedForRole) {
    return {
      ok: false,
      reason: `Unknown role '${role}'.`,
    };
  }
  if (!allowedForRole.has(transitionKey)) {
    return {
      ok: false,
      reason: `Role '${role}' is not authorised to perform '${transitionKey}'.`,
    };
  }

  return { ok: true, reason: "Authorised." };
}

/**
 * Helper for UI disclosure — returns every transition a role MAY perform
 * from the current state. Empty list = hide the transitions menu entirely.
 */
export function allowedTransitionsFor(
  role: ActorRole,
  state: ClaimState,
): TransitionKey[] {
  const allowedForRole = ROLE_TRANSITION_MATRIX[role] ?? new Set();
  const result: TransitionKey[] = [];
  for (const key of Object.keys(TRANSITION_FROM_STATES) as TransitionKey[]) {
    if (allowedForRole.has(key) && TRANSITION_FROM_STATES[key].has(state)) {
      result.push(key);
    }
  }
  return result;
}
