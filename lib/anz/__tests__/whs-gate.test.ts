import { describe, expect, it } from "vitest";
import { evaluateWhsGate } from "../whs-gate";

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
