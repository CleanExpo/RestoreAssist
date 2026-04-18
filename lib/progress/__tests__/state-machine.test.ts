import { describe, it, expect } from "vitest";
import {
  TRANSITION_KEYS,
  TERMINAL_STATES,
  NON_WITHDRAWABLE_STATES,
  isValidTransition,
  nextState,
  legalKeysFrom,
} from "../state-machine";

describe("state-machine", () => {
  describe("nextState", () => {
    it("advances INTAKE → STABILISATION_ACTIVE via start_stabilisation", () => {
      expect(nextState("INTAKE", "start_stabilisation")).toBe(
        "STABILISATION_ACTIVE",
      );
    });

    it("completes the happy-path lifecycle INTAKE → CLOSED", () => {
      const path: Array<
        [Parameters<typeof nextState>[0], Parameters<typeof nextState>[1]]
      > = [
        ["INTAKE", "start_stabilisation"],
        ["STABILISATION_ACTIVE", "attest_stabilisation"],
        ["STABILISATION_COMPLETE", "begin_scope"],
        ["SCOPE_DRAFT", "approve_scope"],
        ["SCOPE_APPROVED", "commence_drying"],
        ["DRYING_ACTIVE", "certify_drying"],
        ["DRYING_CERTIFIED", "initiate_closeout"],
        ["CLOSEOUT", "issue_invoice"],
        ["INVOICE_ISSUED", "record_payment"],
        ["INVOICE_PAID", "close_claim"],
      ];
      for (const [from, key] of path) {
        const to = nextState(from, key);
        expect(to).not.toBeNull();
      }
      expect(nextState("INVOICE_PAID", "close_claim")).toBe("CLOSED");
    });

    it("returns null for illegal transitions", () => {
      expect(nextState("INTAKE", "close_claim")).toBeNull();
      expect(nextState("CLOSED", "start_stabilisation")).toBeNull();
      expect(nextState("WITHDRAWN", "start_stabilisation")).toBeNull();
    });

    it("handles WHS hold loop", () => {
      expect(nextState("STABILISATION_ACTIVE", "whs_incident_raised")).toBe(
        "WHS_HOLD",
      );
      expect(nextState("WHS_HOLD", "whs_cleared")).toBe("STABILISATION_ACTIVE");
    });

    it("allows variation from both SCOPE_APPROVED and DRYING_ACTIVE", () => {
      expect(nextState("SCOPE_APPROVED", "raise_variation")).toBe(
        "VARIATION_REVIEW",
      );
      expect(nextState("DRYING_ACTIVE", "raise_variation")).toBe(
        "VARIATION_REVIEW",
      );
    });

    it("returns variation to SCOPE_APPROVED on approve, SCOPE_DRAFT on reject", () => {
      expect(nextState("VARIATION_REVIEW", "variation_approved")).toBe(
        "SCOPE_APPROVED",
      );
      expect(nextState("VARIATION_REVIEW", "variation_rejected")).toBe(
        "SCOPE_DRAFT",
      );
    });

    it("supports dispute lifecycle", () => {
      expect(nextState("INVOICE_ISSUED", "raise_dispute")).toBe("DISPUTED");
      expect(nextState("DISPUTED", "dispute_resolved")).toBe("INVOICE_ISSUED");
      expect(nextState("DISPUTED", "write_off")).toBe("WITHDRAWN");
    });
  });

  describe("withdraw", () => {
    it("is allowed from early states", () => {
      expect(nextState("INTAKE", "withdraw")).toBe("WITHDRAWN");
      expect(nextState("STABILISATION_ACTIVE", "withdraw")).toBe("WITHDRAWN");
      expect(nextState("SCOPE_DRAFT", "withdraw")).toBe("WITHDRAWN");
      expect(nextState("DRYING_ACTIVE", "withdraw")).toBe("WITHDRAWN");
    });

    it("is blocked after payment and from terminal states", () => {
      for (const s of NON_WITHDRAWABLE_STATES) {
        expect(nextState(s, "withdraw")).toBeNull();
      }
    });
  });

  describe("isValidTransition", () => {
    it("accepts legal (from,key,to) triples", () => {
      expect(
        isValidTransition(
          "INTAKE",
          "start_stabilisation",
          "STABILISATION_ACTIVE",
        ),
      ).toBe(true);
    });

    it("rejects mismatched to-state", () => {
      expect(
        isValidTransition("INTAKE", "start_stabilisation", "SCOPE_DRAFT"),
      ).toBe(false);
    });

    it("rejects out-of-band key", () => {
      expect(isValidTransition("INTAKE", "close_claim", "CLOSED")).toBe(false);
    });
  });

  describe("legalKeysFrom", () => {
    it("returns multiple keys from branching states", () => {
      const fromScopeApproved = legalKeysFrom("SCOPE_APPROVED");
      expect(fromScopeApproved).toContain("commence_drying");
      expect(fromScopeApproved).toContain("raise_variation");
      expect(fromScopeApproved).toContain("withdraw");
    });

    it("returns empty for CLOSED (terminal)", () => {
      expect(legalKeysFrom("CLOSED")).toHaveLength(0);
    });

    it("returns empty for WITHDRAWN (terminal)", () => {
      expect(legalKeysFrom("WITHDRAWN")).toHaveLength(0);
    });

    it("does not include withdraw from INVOICE_PAID", () => {
      expect(legalKeysFrom("INVOICE_PAID")).not.toContain("withdraw");
    });
  });

  describe("TRANSITION_KEYS catalogue", () => {
    it("has 20 unique keys", () => {
      expect(new Set(TRANSITION_KEYS).size).toBe(TRANSITION_KEYS.length);
      expect(TRANSITION_KEYS.length).toBe(20);
    });

    it("includes every expected key", () => {
      const expected = [
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
      ];
      for (const k of expected) {
        expect(TRANSITION_KEYS).toContain(k);
      }
    });
  });

  describe("terminal states", () => {
    it("CLOSED and WITHDRAWN are the only terminals", () => {
      expect(TERMINAL_STATES).toEqual(["CLOSED", "WITHDRAWN"]);
    });
  });
});
