import { describe, it, expect } from "vitest";
import { getRACI, rolesForState, statesForRole, raciLabel } from "../raci";

describe("raci", () => {
  describe("getRACI", () => {
    it("returns R for technician during STABILISATION_ACTIVE", () => {
      expect(getRACI("TECHNICIAN", "STABILISATION_ACTIVE")).toBe("R");
    });

    it("returns A for admin everywhere", () => {
      expect(getRACI("ADMIN", "INTAKE")).toBe("A");
      expect(getRACI("ADMIN", "DRYING_ACTIVE")).toBe("A");
      expect(getRACI("ADMIN", "CLOSED")).toBe("A");
    });

    it("gives carrier R on SCOPE_APPROVED (carrier acceptance is the event)", () => {
      expect(getRACI("CARRIER", "SCOPE_APPROVED")).toBe("R");
    });

    it("gives lawyer A on DISPUTED (lawyer runs the dispute)", () => {
      expect(getRACI("EXTERNAL_LAWYER", "DISPUTED")).toBe("A");
    });

    it("gives accounting R on INVOICE_ISSUED and INVOICE_PAID", () => {
      expect(getRACI("ACCOUNTING", "INVOICE_ISSUED")).toBe("R");
      expect(getRACI("ACCOUNTING", "INVOICE_PAID")).toBe("R");
    });

    it("keeps junior as I on INTAKE (not party to dispatch)", () => {
      expect(getRACI("TECHNICIAN_JUNIOR", "INTAKE")).toBe("I");
    });

    it("junior still R for evidence on STABILISATION_ACTIVE + DRYING_ACTIVE", () => {
      expect(getRACI("TECHNICIAN_JUNIOR", "STABILISATION_ACTIVE")).toBe("R");
      expect(getRACI("TECHNICIAN_JUNIOR", "DRYING_ACTIVE")).toBe("R");
    });

    it("returns null for CARRIER in INTAKE (not party)", () => {
      expect(getRACI("CARRIER", "INTAKE")).toBeNull();
    });

    it("returns null for EXTERNAL_LAWYER in DRYING_ACTIVE (not party)", () => {
      expect(getRACI("EXTERNAL_LAWYER", "DRYING_ACTIVE")).toBeNull();
    });

    it("returns null for TECHNICIAN in INVOICE_ISSUED (billing not their lane)", () => {
      expect(getRACI("TECHNICIAN", "INVOICE_ISSUED")).toBeNull();
    });
  });

  describe("rolesForState", () => {
    it("returns all parties for DRYING_ACTIVE", () => {
      const roles = rolesForState("DRYING_ACTIVE");
      const names = roles.map((r) => r.role).sort();
      expect(names).toContain("TECHNICIAN");
      expect(names).toContain("MANAGER");
      expect(names).toContain("ADMIN");
    });

    it("returns smaller set for DISPUTED (billing-focus)", () => {
      const roles = rolesForState("DISPUTED");
      const names = roles.map((r) => r.role);
      expect(names).toContain("EXTERNAL_LAWYER");
      expect(names).not.toContain("TECHNICIAN");
      expect(names).not.toContain("TECHNICIAN_JUNIOR");
    });
  });

  describe("statesForRole", () => {
    it("lawyer has coverage on INVOICE_*, DISPUTED, CLOSED, WITHDRAWN only", () => {
      const states = statesForRole("EXTERNAL_LAWYER").map((s) => s.state);
      expect(states).toContain("DISPUTED");
      expect(states).toContain("INVOICE_ISSUED");
      expect(states).toContain("CLOSED");
      expect(states).not.toContain("INTAKE");
      expect(states).not.toContain("STABILISATION_ACTIVE");
    });

    it("technician has coverage throughout operational phases", () => {
      const states = statesForRole("TECHNICIAN").map((s) => s.state);
      expect(states).toContain("STABILISATION_ACTIVE");
      expect(states).toContain("DRYING_ACTIVE");
      expect(states).toContain("DRYING_CERTIFIED");
    });

    it("admin has coverage in every state", () => {
      const states = statesForRole("ADMIN").map((s) => s.state);
      // 15 ClaimState values; admin is accountable in all of them
      expect(states.length).toBe(15);
    });
  });

  describe("raciLabel", () => {
    it("returns long-form label for each letter", () => {
      expect(raciLabel("R")).toContain("Responsible");
      expect(raciLabel("A")).toContain("Accountable");
      expect(raciLabel("C")).toContain("Consulted");
      expect(raciLabel("I")).toContain("Informed");
    });
  });
});
