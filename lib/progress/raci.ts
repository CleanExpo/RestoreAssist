/**
 * RACI lookup — who is Responsible, Accountable, Consulted, Informed for a
 * given (state, role) combination.
 *
 * Authorisation contract source of truth: Board Minutes §5.3 (M-3).
 * Behavioural enforcement lives in ./permissions.ts. This file is the
 * documentation-and-UI surface: it returns the RACI letter for each
 * actor/state pair so the UI can show a tech "You are Responsible here"
 * or a carrier "You are Consulted on this stage".
 *
 * Board doc: .claude/board-2026-04-18/raci-matrix.md
 */

import type { ClaimState } from "@prisma/client";
import type { ProgressRole } from "./permissions";

export type RaciLetter = "R" | "A" | "C" | "I";

const M: Record<ClaimState, Partial<Record<ProgressRole, RaciLetter>>> = {
  INTAKE: {
    ADMIN: "A",
    MANAGER: "R",
    TECHNICIAN: "R",
    TECHNICIAN_JUNIOR: "I",
  },
  STABILISATION_ACTIVE: {
    TECHNICIAN: "R",
    TECHNICIAN_JUNIOR: "R", // responsible for evidence capture; junior cannot attest
    MANAGER: "A",
    ADMIN: "A",
  },
  WHS_HOLD: {
    TECHNICIAN: "I",
    MANAGER: "R",
    ADMIN: "A",
  },
  STABILISATION_COMPLETE: {
    TECHNICIAN: "R",
    MANAGER: "A",
    ADMIN: "A",
    CARRIER: "I",
  },
  SCOPE_DRAFT: {
    TECHNICIAN: "C",
    MANAGER: "R",
    ADMIN: "A",
    CARRIER: "C",
  },
  SCOPE_APPROVED: {
    TECHNICIAN: "I",
    MANAGER: "R",
    ADMIN: "A",
    CARRIER: "R", // carrier approval is the event
  },
  DRYING_ACTIVE: {
    TECHNICIAN: "R",
    TECHNICIAN_JUNIOR: "R",
    MANAGER: "A",
    ADMIN: "A",
  },
  VARIATION_REVIEW: {
    TECHNICIAN: "C",
    MANAGER: "R",
    ADMIN: "A",
    CARRIER: "R", // if threshold breached
  },
  DRYING_CERTIFIED: {
    TECHNICIAN: "R",
    MANAGER: "A",
    ADMIN: "A",
    CARRIER: "I",
  },
  CLOSEOUT: {
    TECHNICIAN: "I",
    MANAGER: "A",
    ADMIN: "A",
    ACCOUNTING: "C",
    CARRIER: "I",
  },
  INVOICE_ISSUED: {
    MANAGER: "C",
    ADMIN: "A",
    ACCOUNTING: "R",
    CARRIER: "I",
    EXTERNAL_LAWYER: "I",
  },
  INVOICE_PAID: {
    MANAGER: "I",
    ADMIN: "A",
    ACCOUNTING: "R",
    CARRIER: "C",
    EXTERNAL_LAWYER: "I",
  },
  DISPUTED: {
    MANAGER: "C",
    ADMIN: "C",
    ACCOUNTING: "C",
    CARRIER: "C",
    EXTERNAL_LAWYER: "A", // lawyer runs the dispute
  },
  CLOSED: {
    TECHNICIAN: "I",
    MANAGER: "I",
    ADMIN: "A",
    ACCOUNTING: "I",
    CARRIER: "I",
    EXTERNAL_LAWYER: "I",
  },
  WITHDRAWN: {
    MANAGER: "I",
    ADMIN: "A",
    ACCOUNTING: "I",
    EXTERNAL_LAWYER: "I",
  },
};

/**
 * Return the RACI letter for a role in a state, or null if no
 * relationship (the role is not party to that stage).
 */
export function getRACI(
  role: ProgressRole,
  state: ClaimState,
): RaciLetter | null {
  return M[state]?.[role] ?? null;
}

/** UI helper — get all roles and their RACI letters for a given state. */
export function rolesForState(
  state: ClaimState,
): Array<{ role: ProgressRole; letter: RaciLetter }> {
  const entry = M[state] ?? {};
  return (Object.entries(entry) as Array<[ProgressRole, RaciLetter]>).map(
    ([role, letter]) => ({ role, letter }),
  );
}

/** UI helper — get all states where a given role has any relationship. */
export function statesForRole(
  role: ProgressRole,
): Array<{ state: ClaimState; letter: RaciLetter }> {
  return (Object.entries(M) as Array<[ClaimState, (typeof M)[ClaimState]]>)
    .map(([state, letters]) => {
      const letter = letters[role];
      return letter ? { state, letter } : null;
    })
    .filter((x): x is { state: ClaimState; letter: RaciLetter } => x !== null);
}

/** Long-form label for UI tooltips. */
export function raciLabel(letter: RaciLetter): string {
  return {
    R: "Responsible — performs the work",
    A: "Accountable — owns the outcome",
    C: "Consulted — provides input",
    I: "Informed — kept in the loop",
  }[letter];
}
