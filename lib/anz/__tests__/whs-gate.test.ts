import { describe, expect, it } from "vitest";
import { evaluateWhsGate, ASBESTOS_BAN_YEAR } from "../whs-gate";
import { ASBESTOS_PRESUMPTION_YEAR } from "@/lib/compliance/asbestos-era";

describe("WHS asbestos gate", () => {
  it("blocks strip-out of pre-ban fibro until a WHS pathway is recorded", () => {
    const r = evaluateWhsGate({
      materialId: "fibro",
      propertyYearBuilt: 1995,
      action: "strip_out",
    });
    expect(r.suspectedAcm).toBe(true);
    expect(r.blocked).toBe(true);
    expect(r.allowed).toBe(false);
    expect(r.requiresWhsPathway).toBe(true);
    expect(r.reason.toLowerCase()).toContain("asbestos");
  });

  it("allows strip-out once a WHS pathway note is recorded", () => {
    const r = evaluateWhsGate({
      materialId: "fibro",
      propertyYearBuilt: 1995,
      action: "strip_out",
      whsPathwayNote: "Licensed non-friable removalist engaged (QLD)",
    });
    expect(r.allowed).toBe(true);
    expect(r.blocked).toBe(false);
  });

  it("allows strip-out when the element has been sampled and cleared", () => {
    const r = evaluateWhsGate({
      materialId: "fibro",
      propertyYearBuilt: 1995,
      action: "strip_out",
      hazardStatus: "cleared",
    });
    expect(r.allowed).toBe(true);
  });

  it("does not gate non-ACM materials", () => {
    const r = evaluateWhsGate({
      materialId: "gyprock",
      propertyYearBuilt: 1995,
      action: "strip_out",
    });
    expect(r.suspectedAcm).toBe(false);
    expect(r.allowed).toBe(true);
  });

  it("does not gate post-ban construction even for fibro-type material", () => {
    const r = evaluateWhsGate({
      materialId: "fibro",
      propertyYearBuilt: 2015,
      action: "strip_out",
    });
    expect(r.suspectedAcm).toBe(false);
    expect(r.allowed).toBe(true);
  });

  it("does not gate non-destructive actions", () => {
    const r = evaluateWhsGate({
      materialId: "fibro",
      propertyYearBuilt: 1995,
      action: "annotate",
    });
    expect(r.allowed).toBe(true);
    expect(r.requiresWhsPathway).toBe(false);
  });

  it("treats unknown build year conservatively as at-risk", () => {
    const r = evaluateWhsGate({
      materialId: "fibro",
      action: "demolition",
    });
    expect(r.suspectedAcm).toBe(true);
    expect(r.blocked).toBe(true);
  });

  it("honours an explicit isPotentialAcm override", () => {
    const r = evaluateWhsGate({
      isPotentialAcm: true,
      propertyYearBuilt: 1990,
      action: "cut_back",
    });
    expect(r.suspectedAcm).toBe(true);
    expect(r.blocked).toBe(true);
  });
});

describe("WHS asbestos gate — the year has one owner", () => {
  /**
   * ASBESTOS_BAN_YEAR was a local constant. Its VALUE was right for Australia,
   * so nothing was broken — but a regulatory year living in a second place is
   * how this whole class regenerates: the same asbestos question was answered
   * differently in nine files before lib/compliance/asbestos-era.ts was built,
   * and the safety-critical copies had the wrong answer.
   *
   * This asserts the constant IS the registry's number rather than a copy that
   * happens to match today.
   */
  it("takes the Australian presumption year from the registry", () => {
    expect(ASBESTOS_BAN_YEAR).toBe(ASBESTOS_PRESUMPTION_YEAR.AU);
  });

  it("uses New Zealand's earlier year when the caller can resolve one", () => {
    // NZ's threshold is 1 January 2000, Australia's is 2004. A 2002 building is
    // inside the Australian window and outside the New Zealand one. Callers that
    // cannot resolve a country keep the Australian default, which over-blocks
    // rather than under-warns.
    const nz = evaluateWhsGate({
      materialId: "fibro",
      propertyYearBuilt: 2002,
      action: "strip_out",
      jurisdiction: "NZ",
    });
    expect(nz.suspectedAcm).toBe(false);

    const au = evaluateWhsGate({
      materialId: "fibro",
      propertyYearBuilt: 2002,
      action: "strip_out",
    });
    expect(au.suspectedAcm).toBe(true);
  });

  it("still treats an unknown build year as at-risk in either country", () => {
    // The conservative default must survive the jurisdiction parameter.
    for (const jurisdiction of ["AU", "NZ"] as const) {
      const r = evaluateWhsGate({
        materialId: "fibro",
        action: "strip_out",
        jurisdiction,
      });
      expect(r.suspectedAcm).toBe(true);
    }
  });
});
