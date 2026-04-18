/**
 * Progress RBAC — who can trigger which transition from which state.
 *
 * Board reference: .claude/board-2026-04-18/00-board-minutes.md §5.3 RACI.
 *
 * Roles are the Progress-specific roles; they are derived from
 * User.role + WorkspaceRole bindings in the caller.
 *
 * Junior technicians (Board M-16) are TECHNICIAN role with a `junior` flag
 * that further restricts which transitions they can perform.
 */

import type { ClaimState } from "@prisma/client";
import type { TransitionKey } from "./state-machine";

export type ProgressRole =
  | "TECHNICIAN"
  | "TECHNICIAN_JUNIOR"
  | "MANAGER"
  | "ADMIN"
  | "ACCOUNTING"
  | "CARRIER"
  | "EXTERNAL_LAWYER";

/**
 * Matrix of which roles may trigger which transition keys, regardless of
 * state. State-level permission is a separate check (see permissionsForState).
 */
const KEY_PERMISSIONS: Record<TransitionKey, ProgressRole[]> = {
  start_stabilisation: ["TECHNICIAN", "MANAGER", "ADMIN"],
  attest_stabilisation: ["TECHNICIAN", "MANAGER", "ADMIN"], // dual-sign enforced at attestation layer
  whs_incident_raised: ["TECHNICIAN", "TECHNICIAN_JUNIOR", "MANAGER", "ADMIN"],
  whs_cleared: ["MANAGER", "ADMIN"],
  begin_scope: ["MANAGER", "ADMIN"],
  approve_scope: ["MANAGER", "ADMIN", "CARRIER"],
  commence_drying: ["TECHNICIAN", "MANAGER", "ADMIN"],
  raise_variation: ["TECHNICIAN", "MANAGER", "ADMIN"],
  variation_approved: ["MANAGER", "ADMIN", "CARRIER"],
  variation_rejected: ["MANAGER", "ADMIN", "CARRIER"],
  certify_drying: ["TECHNICIAN", "MANAGER", "ADMIN"], // dual-sign at attestation layer
  initiate_closeout: ["MANAGER", "ADMIN"],
  issue_invoice: ["ACCOUNTING", "MANAGER", "ADMIN"],
  reopen_drying: ["ADMIN"],
  record_payment: ["ACCOUNTING", "ADMIN"],
  raise_dispute: ["EXTERNAL_LAWYER", "ADMIN"],
  dispute_resolved: ["EXTERNAL_LAWYER", "ADMIN"],
  write_off: ["ADMIN"],
  close_claim: ["MANAGER", "ADMIN"],
  withdraw: ["ADMIN"],
};

/**
 * State-level permission. A role that may read/write/attest within a state.
 * R = read; W = trigger transition out of state; A = attest a transition.
 *
 * For the Sprint-1 API surface we use this as the gate for the transition
 * endpoint: if the role cannot at least W in the from-state, reject.
 */
type Perm = "R" | "W" | "A";
const STATE_PERMISSIONS: Record<
  ClaimState,
  Partial<Record<ProgressRole, Perm[]>>
> = {
  INTAKE: {
    ADMIN: ["R", "W"],
    MANAGER: ["R", "W"],
    // Senior tech arriving on-site triggers start_stabilisation themselves
    // (Product/UX paper §3 — the T+0h30 flow). Junior techs still blocked by
    // TECHNICIAN_JUNIOR short-circuit in canPerformTransition.
    TECHNICIAN: ["R", "W"],
  },
  STABILISATION_ACTIVE: {
    TECHNICIAN: ["R", "W"],
    TECHNICIAN_JUNIOR: ["R"], // junior contributes evidence, cannot W/A (Board M-16)
    MANAGER: ["R", "W", "A"],
    ADMIN: ["R", "W", "A"],
  },
  WHS_HOLD: {
    TECHNICIAN: ["R"],
    MANAGER: ["R", "W"],
    ADMIN: ["R", "W"],
  },
  STABILISATION_COMPLETE: {
    TECHNICIAN: ["R"],
    MANAGER: ["R", "W"],
    ADMIN: ["R", "W"],
    CARRIER: ["R"],
  },
  SCOPE_DRAFT: {
    TECHNICIAN: ["R"],
    MANAGER: ["R", "W"],
    ADMIN: ["R", "W"],
    // Carrier can approve_scope (SCOPE_DRAFT → SCOPE_APPROVED) per RACI §5.3
    CARRIER: ["R", "W"],
  },
  SCOPE_APPROVED: {
    TECHNICIAN: ["R"],
    MANAGER: ["R", "W"],
    ADMIN: ["R", "W"],
    CARRIER: ["R", "A"],
  },
  DRYING_ACTIVE: {
    TECHNICIAN: ["R", "W"],
    TECHNICIAN_JUNIOR: ["R"], // evidence-only, no transitions (Board M-16)
    MANAGER: ["R", "W", "A"],
    ADMIN: ["R", "W", "A"],
  },
  VARIATION_REVIEW: {
    TECHNICIAN: ["R"],
    MANAGER: ["R", "W", "A"],
    ADMIN: ["R", "W", "A"],
    // Carrier can approve/reject variations when delta > threshold (M-6)
    CARRIER: ["R", "W", "A"],
  },
  DRYING_CERTIFIED: {
    TECHNICIAN: ["R"],
    MANAGER: ["R", "W"],
    ADMIN: ["R", "W"],
  },
  CLOSEOUT: {
    TECHNICIAN: ["R"],
    MANAGER: ["R", "W"],
    ADMIN: ["R", "W"],
    // Accounting can issue_invoice (CLOSEOUT → INVOICE_ISSUED) per RACI §5.3
    ACCOUNTING: ["R", "W"],
  },
  INVOICE_ISSUED: {
    MANAGER: ["R"],
    ADMIN: ["R", "W"],
    ACCOUNTING: ["R", "W"],
    CARRIER: ["R"],
    // Lawyer can raise_dispute (INVOICE_ISSUED → DISPUTED) per RACI §5.3
    EXTERNAL_LAWYER: ["R", "W"],
  },
  INVOICE_PAID: {
    MANAGER: ["R"],
    ADMIN: ["R"],
    ACCOUNTING: ["R", "W"],
    CARRIER: ["R"],
    EXTERNAL_LAWYER: ["R"],
  },
  DISPUTED: {
    MANAGER: ["R"],
    ADMIN: ["R", "W"],
    ACCOUNTING: ["R"],
    CARRIER: ["R"],
    EXTERNAL_LAWYER: ["R", "W"],
  },
  CLOSED: {
    TECHNICIAN: ["R"],
    MANAGER: ["R"],
    ADMIN: ["R"],
    ACCOUNTING: ["R"],
    CARRIER: ["R"],
    EXTERNAL_LAWYER: ["R"],
  },
  WITHDRAWN: {
    MANAGER: ["R"],
    ADMIN: ["R"],
    ACCOUNTING: ["R"],
    EXTERNAL_LAWYER: ["R"],
  },
};

/**
 * Can the given role perform the given transition from the given state?
 * This is the single gate the transition API route must pass before any
 * DB work happens.
 */
export function canPerformTransition(
  role: ProgressRole,
  fromState: ClaimState,
  key: TransitionKey,
): boolean {
  // Junior techs can never trigger transitions (Board M-16 hard rule).
  // They contribute evidence; seniors/managers attest.
  if (role === "TECHNICIAN_JUNIOR") return false;

  // Role must be allowed for this transition key
  const allowedRoles = KEY_PERMISSIONS[key];
  if (!allowedRoles.includes(role)) return false;

  // Role must have write permission in the from-state
  const statePerms = STATE_PERMISSIONS[fromState]?.[role];
  if (!statePerms?.includes("W")) return false;

  return true;
}

/**
 * Can the given role read the claim progress row at all?
 * If false, the GET endpoint returns 403.
 */
export function canRead(role: ProgressRole, state: ClaimState): boolean {
  return Boolean(STATE_PERMISSIONS[state]?.[role]?.includes("R"));
}

/**
 * Can the given role attest a transition in the given state?
 * Used by the attestation endpoint (M-3 / ProgressAttestation writes).
 */
export function canAttest(role: ProgressRole, state: ClaimState): boolean {
  return Boolean(STATE_PERMISSIONS[state]?.[role]?.includes("A"));
}

/**
 * Map a DB User.role + optional workspace binding + optional junior flag
 * onto a ProgressRole. Kept alongside the permission logic so callers have
 * a single import surface.
 */
export function resolveProgressRole(args: {
  userRole: "USER" | "ADMIN" | "MANAGER" | string;
  workspaceRoleName?: string | null;
  isJuniorTechnician?: boolean;
}): ProgressRole {
  const ws = args.workspaceRoleName?.toUpperCase() ?? "";
  if (ws === "EXTERNAL_LAWYER" || ws === "LEGAL") return "EXTERNAL_LAWYER";
  if (ws === "ACCOUNTING" || ws === "BOOKKEEPER") return "ACCOUNTING";
  if (ws === "CARRIER" || ws === "INSURER") return "CARRIER";

  if (args.userRole === "ADMIN") return "ADMIN";
  if (args.userRole === "MANAGER") return "MANAGER";
  return args.isJuniorTechnician ? "TECHNICIAN_JUNIOR" : "TECHNICIAN";
}
