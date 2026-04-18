import { describe, it, expect } from "vitest";
import {
  canPerformTransition,
  canRead,
  canAttest,
  resolveProgressRole,
} from "../permissions";

describe("permissions", () => {
  describe("canPerformTransition", () => {
    it("allows ADMIN to trigger anything legal from the state", () => {
      expect(
        canPerformTransition("ADMIN", "INTAKE", "start_stabilisation"),
      ).toBe(true);
      expect(canPerformTransition("ADMIN", "DISPUTED", "write_off")).toBe(true);
    });

    it("allows TECHNICIAN to start and attest stabilisation", () => {
      expect(
        canPerformTransition("TECHNICIAN", "INTAKE", "start_stabilisation"),
      ).toBe(true);
      expect(
        canPerformTransition(
          "TECHNICIAN",
          "STABILISATION_ACTIVE",
          "attest_stabilisation",
        ),
      ).toBe(true);
    });

    it("blocks TECHNICIAN_JUNIOR from every transition (Board M-16)", () => {
      expect(
        canPerformTransition(
          "TECHNICIAN_JUNIOR",
          "INTAKE",
          "start_stabilisation",
        ),
      ).toBe(false);
      expect(
        canPerformTransition(
          "TECHNICIAN_JUNIOR",
          "STABILISATION_ACTIVE",
          "attest_stabilisation",
        ),
      ).toBe(false);
      expect(
        canPerformTransition(
          "TECHNICIAN_JUNIOR",
          "DRYING_ACTIVE",
          "certify_drying",
        ),
      ).toBe(false);
    });

    it("blocks MANAGER from record_payment (ACCOUNTING-only)", () => {
      expect(
        canPerformTransition("MANAGER", "INVOICE_ISSUED", "record_payment"),
      ).toBe(false);
    });

    it("allows ACCOUNTING to record_payment and issue_invoice", () => {
      expect(
        canPerformTransition("ACCOUNTING", "CLOSEOUT", "issue_invoice"),
      ).toBe(true);
      expect(
        canPerformTransition("ACCOUNTING", "INVOICE_ISSUED", "record_payment"),
      ).toBe(true);
    });

    it("blocks TECHNICIAN from record_payment", () => {
      expect(
        canPerformTransition("TECHNICIAN", "INVOICE_ISSUED", "record_payment"),
      ).toBe(false);
    });

    it("allows EXTERNAL_LAWYER to raise and resolve disputes only", () => {
      expect(
        canPerformTransition(
          "EXTERNAL_LAWYER",
          "INVOICE_ISSUED",
          "raise_dispute",
        ),
      ).toBe(true);
      expect(
        canPerformTransition("EXTERNAL_LAWYER", "DISPUTED", "dispute_resolved"),
      ).toBe(true);
      expect(
        canPerformTransition(
          "EXTERNAL_LAWYER",
          "INTAKE",
          "start_stabilisation",
        ),
      ).toBe(false);
    });

    it("allows CARRIER to approve scope and variations", () => {
      expect(
        canPerformTransition("CARRIER", "SCOPE_DRAFT", "approve_scope"),
      ).toBe(true);
      expect(
        canPerformTransition(
          "CARRIER",
          "VARIATION_REVIEW",
          "variation_approved",
        ),
      ).toBe(true);
    });

    it("blocks CARRIER from starting or running drying", () => {
      expect(
        canPerformTransition("CARRIER", "SCOPE_APPROVED", "commence_drying"),
      ).toBe(false);
      expect(
        canPerformTransition("CARRIER", "DRYING_ACTIVE", "certify_drying"),
      ).toBe(false);
    });

    it("only ADMIN can withdraw", () => {
      expect(canPerformTransition("ADMIN", "INTAKE", "withdraw")).toBe(true);
      expect(canPerformTransition("MANAGER", "INTAKE", "withdraw")).toBe(false);
      expect(canPerformTransition("TECHNICIAN", "INTAKE", "withdraw")).toBe(
        false,
      );
    });

    it("only ADMIN can reopen drying", () => {
      expect(canPerformTransition("ADMIN", "CLOSEOUT", "reopen_drying")).toBe(
        true,
      );
      expect(canPerformTransition("MANAGER", "CLOSEOUT", "reopen_drying")).toBe(
        false,
      );
    });
  });

  describe("canRead", () => {
    it("allows all active roles to read intermediate states", () => {
      expect(canRead("ADMIN", "DRYING_ACTIVE")).toBe(true);
      expect(canRead("MANAGER", "DRYING_ACTIVE")).toBe(true);
      expect(canRead("TECHNICIAN", "DRYING_ACTIVE")).toBe(true);
    });

    it("blocks TECHNICIAN from reading INVOICE_ISSUED", () => {
      expect(canRead("TECHNICIAN", "INVOICE_ISSUED")).toBe(false);
      expect(canRead("TECHNICIAN_JUNIOR", "INVOICE_ISSUED")).toBe(false);
    });

    it("allows EXTERNAL_LAWYER to read from INVOICE_ISSUED onward", () => {
      expect(canRead("EXTERNAL_LAWYER", "INVOICE_ISSUED")).toBe(true);
      expect(canRead("EXTERNAL_LAWYER", "DISPUTED")).toBe(true);
      expect(canRead("EXTERNAL_LAWYER", "CLOSED")).toBe(true);
    });

    it("blocks EXTERNAL_LAWYER from reading earlier states", () => {
      expect(canRead("EXTERNAL_LAWYER", "INTAKE")).toBe(false);
      expect(canRead("EXTERNAL_LAWYER", "SCOPE_DRAFT")).toBe(false);
    });
  });

  describe("canAttest", () => {
    it("MANAGER can attest in STABILISATION_ACTIVE, DRYING_ACTIVE, VARIATION_REVIEW", () => {
      expect(canAttest("MANAGER", "STABILISATION_ACTIVE")).toBe(true);
      expect(canAttest("MANAGER", "DRYING_ACTIVE")).toBe(true);
      expect(canAttest("MANAGER", "VARIATION_REVIEW")).toBe(true);
    });

    it("CARRIER can attest SCOPE_APPROVED and VARIATION_REVIEW", () => {
      expect(canAttest("CARRIER", "SCOPE_APPROVED")).toBe(true);
      expect(canAttest("CARRIER", "VARIATION_REVIEW")).toBe(true);
    });

    it("TECHNICIAN_JUNIOR cannot attest anywhere", () => {
      expect(canAttest("TECHNICIAN_JUNIOR", "STABILISATION_ACTIVE")).toBe(
        false,
      );
      expect(canAttest("TECHNICIAN_JUNIOR", "DRYING_ACTIVE")).toBe(false);
    });
  });

  describe("resolveProgressRole", () => {
    it("maps User.role=ADMIN to ADMIN", () => {
      expect(resolveProgressRole({ userRole: "ADMIN" })).toBe("ADMIN");
    });

    it("maps User.role=MANAGER to MANAGER", () => {
      expect(resolveProgressRole({ userRole: "MANAGER" })).toBe("MANAGER");
    });

    it("defaults to TECHNICIAN for USER", () => {
      expect(resolveProgressRole({ userRole: "USER" })).toBe("TECHNICIAN");
    });

    it("respects isJuniorTechnician flag", () => {
      expect(
        resolveProgressRole({ userRole: "USER", isJuniorTechnician: true }),
      ).toBe("TECHNICIAN_JUNIOR");
    });

    it("workspace role beats User.role", () => {
      expect(
        resolveProgressRole({
          userRole: "USER",
          workspaceRoleName: "Accounting",
        }),
      ).toBe("ACCOUNTING");
      expect(
        resolveProgressRole({
          userRole: "MANAGER",
          workspaceRoleName: "Legal",
        }),
      ).toBe("EXTERNAL_LAWYER");
    });
  });
});
