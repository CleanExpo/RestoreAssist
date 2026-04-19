/**
 * Start-of-lifecycle and trivial guards — pass-through gates where the
 * state-machine edge and permission layer are sufficient, no DB evidence
 * required.
 *
 *   INTAKE → STABILISATION_ACTIVE (start_stabilisation)
 *   STABILISATION_COMPLETE → SCOPE_DRAFT (begin_scope)
 *   CLOSEOUT → DRYING_ACTIVE (reopen_drying)  [admin-only override]
 */

import type { GuardFn } from "./types";

export const startStabilisationGuard: GuardFn = async (_db, _ctx) => {
  // State-machine edge from INTAKE + permission check are the gate.
  // Field-team arrival trigger; no DB evidence yet at this point.
  return {
    passed: true,
    snapshot: { startedAt: new Date().toISOString() },
  };
};

export const beginScopeGuard: GuardFn = async (_db, _ctx) => {
  // STABILISATION_COMPLETE has already been attested; begin_scope is the
  // administrative move to open scope authoring.
  return {
    passed: true,
    snapshot: { beganAt: new Date().toISOString() },
  };
};

export const reopenDryingGuard: GuardFn = async (_db, _ctx) => {
  // Admin-only override — permissions layer enforces. No evidence gate
  // (the whole point is overriding evidence).
  return {
    passed: true,
    snapshot: { reopenedAt: new Date().toISOString(), gate: "admin_override" },
  };
};
