/**
 * permissions.test.ts — M-3 (RA-1379)
 *
 * Locks the conservative-default RACI matrix shipped by permissions.ts.
 * When board minutes §5.3 lands and the table is swapped, these tests
 * keep their STRUCTURE (one assertion per role × transition); only the
 * boolean expectation per cell flips for the cells that differ.
 */
import { describe, it, expect } from "vitest";
import {
  canPerformTransition,
  allowedTransitionsFor,
  type ClaimState,
  type ActorRole,
  type TransitionKey,
} from "../permissions";

describe("canPerformTransition — conservative default RACI", () => {
  // ── State-machine validity (role-independent) ──────────────────────────
  it("rejects unknown transitionKey with a helpful reason", () => {
    const r = canPerformTransition(
      "ADMIN",
      "INTAKE",
      "time_travel" as unknown as TransitionKey,
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/unknown transition key/i);
  });

  it("rejects valid transition from wrong source state, lists valid sources", () => {
    // certify_drying only valid from DRYING_ACTIVE
    const r = canPerformTransition("ADMIN", "INTAKE", "certify_drying");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not valid from state 'INTAKE'/);
    expect(r.reason).toMatch(/DRYING_ACTIVE/);
  });

  it("rejects unknown role with a helpful reason", () => {
    const r = canPerformTransition(
      "SUPERUSER" as unknown as ActorRole,
      "STABILISATION_ACTIVE",
      "attest_stabilisation",
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/unknown role/i);
  });

  // ── ADMIN: full authority ───────────────────────────────────────────────
  it("ADMIN can perform every transition from its valid source state", () => {
    const cases: Array<[ClaimState, TransitionKey]> = [
      ["STABILISATION_ACTIVE",     "attest_stabilisation"],
      ["STABILISATION_ACTIVE",     "attest_whs_hazard"],
      ["WHS_HOLD",                 "attest_whs_cleared"],
      ["STABILISATION_COMPLETE",   "submit_scope"],
      ["SCOPE_DRAFT",              "carrier_authorise"],
      ["VARIATION_REVIEW",         "carrier_authorise_variation"],
      ["SCOPE_APPROVED",           "commence_drying"],
      ["DRYING_ACTIVE",            "certify_drying"],
      ["DRYING_CERTIFIED",         "commence_closeout"],
      ["CLOSEOUT",                 "issue_invoice"],
      ["INVOICE_ISSUED",           "record_payment"],
      ["INVOICE_ISSUED",           "dispute"],
      ["DISPUTED",                 "resolve_dispute"],
      ["INTAKE",                   "withdraw"],
      ["INVOICE_PAID",             "close"],
    ];
    for (const [state, key] of cases) {
      const r = canPerformTransition("ADMIN", state, key);
      expect(r.ok, `ADMIN: ${state} → ${key}`).toBe(true);
    }
  });

  // ── MANAGER: full except finality ──────────────────────────────────────
  it("MANAGER CAN perform the operational transitions", () => {
    const allowed: Array<[ClaimState, TransitionKey]> = [
      ["STABILISATION_ACTIVE",  "attest_stabilisation"],
      ["STABILISATION_COMPLETE","submit_scope"],
      ["SCOPE_DRAFT",           "carrier_authorise"],
      ["DRYING_ACTIVE",         "certify_drying"],
      ["CLOSEOUT",              "issue_invoice"],
      ["INVOICE_ISSUED",        "record_payment"],
      ["INVOICE_ISSUED",        "dispute"],
    ];
    for (const [state, key] of allowed) {
      expect(canPerformTransition("MANAGER", state, key).ok).toBe(true);
    }
  });

  it("MANAGER CANNOT perform finality transitions (reserved for ADMIN)", () => {
    const denied: Array<[ClaimState, TransitionKey]> = [
      ["DISPUTED",      "resolve_dispute"],
      ["INVOICE_PAID",  "close"],
      ["INTAKE",        "withdraw"],
    ];
    for (const [state, key] of denied) {
      const r = canPerformTransition("MANAGER", state, key);
      expect(r.ok, `MANAGER should NOT: ${state} → ${key}`).toBe(false);
      expect(r.reason).toMatch(/not authorised/i);
    }
  });

  // ── USER (technician): evidence-capture attestations only ──────────────
  it("USER CAN perform the 5 evidence-capture attestations", () => {
    const allowed: Array<[ClaimState, TransitionKey]> = [
      ["STABILISATION_ACTIVE",  "attest_stabilisation"],
      ["STABILISATION_ACTIVE",  "attest_whs_hazard"],
      ["DRYING_ACTIVE",         "attest_whs_hazard"],
      ["WHS_HOLD",              "attest_whs_cleared"],
      ["SCOPE_APPROVED",        "commence_drying"],
      ["DRYING_ACTIVE",         "certify_drying"],
    ];
    for (const [state, key] of allowed) {
      expect(canPerformTransition("USER", state, key).ok).toBe(true);
    }
  });

  it("USER CANNOT perform scope / invoice / close transitions", () => {
    const denied: Array<[ClaimState, TransitionKey]> = [
      ["STABILISATION_COMPLETE", "submit_scope"],
      ["SCOPE_DRAFT",            "carrier_authorise"],
      ["CLOSEOUT",               "issue_invoice"],
      ["INVOICE_ISSUED",         "record_payment"],
      ["INVOICE_PAID",           "close"],
      ["INTAKE",                 "withdraw"],
    ];
    for (const [state, key] of denied) {
      expect(canPerformTransition("USER", state, key).ok).toBe(false);
    }
  });

  // ── JUNIOR_TECHNICIAN: M-16 ring-fence ────────────────────────────────
  it("JUNIOR_TECHNICIAN has ZERO transition rights (M-16 ring-fence)", () => {
    // Even transitions that are structurally valid from the state should
    // be denied on the role cell.
    const cases: Array<[ClaimState, TransitionKey]> = [
      ["STABILISATION_ACTIVE",  "attest_stabilisation"],
      ["DRYING_ACTIVE",         "certify_drying"],
      ["INTAKE",                "withdraw"],
    ];
    for (const [state, key] of cases) {
      const r = canPerformTransition("JUNIOR_TECHNICIAN", state, key);
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/not authorised/i);
    }
    expect(allowedTransitionsFor("JUNIOR_TECHNICIAN", "STABILISATION_ACTIVE")).toEqual([]);
    expect(allowedTransitionsFor("JUNIOR_TECHNICIAN", "DRYING_ACTIVE")).toEqual([]);
  });

  // ── SUBCONTRACTOR / LABOUR_HIRE: 0 until M-13 ──────────────────────────
  it("SUBCONTRACTOR + LABOUR_HIRE have zero transition rights (pending M-13 scoping)", () => {
    for (const role of ["SUBCONTRACTOR", "LABOUR_HIRE"] as ActorRole[]) {
      const r = canPerformTransition(role, "STABILISATION_ACTIVE", "attest_stabilisation");
      expect(r.ok).toBe(false);
      expect(allowedTransitionsFor(role, "STABILISATION_ACTIVE")).toEqual([]);
    }
  });

  // ── Reason strings always populated (principle 3) ──────────────────────
  it("every returned reason is non-empty", () => {
    const sample: Array<[ActorRole, ClaimState, TransitionKey]> = [
      ["ADMIN",             "STABILISATION_ACTIVE",   "attest_stabilisation"],
      ["USER",              "CLOSEOUT",               "issue_invoice"],
      ["JUNIOR_TECHNICIAN", "DRYING_ACTIVE",          "certify_drying"],
      ["MANAGER",           "INVOICE_PAID",           "close"],
    ];
    for (const [role, state, key] of sample) {
      const r = canPerformTransition(role, state, key);
      expect(r.reason.length, `${role}/${state}/${key}`).toBeGreaterThan(0);
    }
  });
});

describe("allowedTransitionsFor — UI progressive disclosure", () => {
  it("ADMIN on STABILISATION_ACTIVE sees the expected 3 transitions", () => {
    const r = allowedTransitionsFor("ADMIN", "STABILISATION_ACTIVE");
    expect(new Set(r)).toEqual(
      new Set<TransitionKey>(["attest_stabilisation", "attest_whs_hazard", "withdraw"]),
    );
  });

  it("USER on STABILISATION_ACTIVE sees the 2 evidence-capture options (no withdraw)", () => {
    const r = allowedTransitionsFor("USER", "STABILISATION_ACTIVE");
    expect(new Set(r)).toEqual(
      new Set<TransitionKey>(["attest_stabilisation", "attest_whs_hazard"]),
    );
  });

  it("MANAGER on INVOICE_PAID sees no transitions (close is ADMIN-only)", () => {
    const r = allowedTransitionsFor("MANAGER", "INVOICE_PAID");
    expect(r).toEqual([]);
  });

  it("any role on terminal CLOSED sees no transitions", () => {
    for (const role of ["ADMIN", "MANAGER", "USER"] as ActorRole[]) {
      expect(allowedTransitionsFor(role, "CLOSED")).toEqual([]);
    }
  });
});
