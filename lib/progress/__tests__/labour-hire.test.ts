import { describe, expect, it } from "vitest";
import {
  LABOUR_HIRE_PORTABLE_LSL_STATES,
  LABOUR_HIRE_SG_MIN_RATE,
  LABOUR_HIRE_MAX_HOURS,
  validateLabourHireAttestation,
} from "../labour-hire";

const ok = {
  hours: 7.5,
  awardClass: "Cleaning Services Award 2020 — Level 4",
  superRate: 0.12,
  portableLslState: "NSW",
  inductionEvidenceId: "ev_induction_1",
};

describe("labour-hire constants", () => {
  it("exposes the SG min rate at 12%", () => {
    expect(LABOUR_HIRE_SG_MIN_RATE).toBe(0.12);
  });

  it("caps hours per row at 168 (one week)", () => {
    expect(LABOUR_HIRE_MAX_HOURS).toBe(168);
  });

  it("lists the 5 AU states with portable LSL schemes", () => {
    expect(LABOUR_HIRE_PORTABLE_LSL_STATES).toEqual([
      "NSW",
      "VIC",
      "QLD",
      "ACT",
      "TAS",
    ]);
  });
});

describe("validateLabourHireAttestation — happy paths", () => {
  it("accepts a fully populated valid input", () => {
    const r = validateLabourHireAttestation(ok);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.normalised).toEqual({
      hours: 7.5,
      awardClass: ok.awardClass,
      superRate: 0.12,
      portableLslState: "NSW",
      inductionEvidenceId: "ev_induction_1",
    });
  });

  it("treats null portableLslState as 'no scheme applies'", () => {
    const r = validateLabourHireAttestation({ ...ok, portableLslState: null });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.normalised.portableLslState).toBeNull();
  });

  it("upper-cases and trims the state code", () => {
    const r = validateLabourHireAttestation({
      ...ok,
      portableLslState: " vic ",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.normalised.portableLslState).toBe("VIC");
  });

  it("accepts numeric strings (form input)", () => {
    const r = validateLabourHireAttestation({
      ...ok,
      hours: "7.5",
      superRate: "0.12",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.normalised.hours).toBe(7.5);
    expect(r.normalised.superRate).toBe(0.12);
  });

  it("accepts a super rate above SG minimum (employer pays >12%)", () => {
    const r = validateLabourHireAttestation({ ...ok, superRate: 0.15 });
    expect(r.ok).toBe(true);
  });
});

describe("validateLabourHireAttestation — required fields", () => {
  it("rejects missing hours", () => {
    const r = validateLabourHireAttestation({ ...ok, hours: null });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.errors.find((e) => e.field === "hours")?.code).toBe("MISSING");
  });

  it("rejects missing awardClass", () => {
    const r = validateLabourHireAttestation({ ...ok, awardClass: null });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.errors.find((e) => e.field === "awardClass")?.code).toBe("MISSING");
  });

  it("rejects missing superRate", () => {
    const r = validateLabourHireAttestation({ ...ok, superRate: null });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.errors.find((e) => e.field === "superRate")?.code).toBe("MISSING");
  });

  it("rejects missing inductionEvidenceId", () => {
    const r = validateLabourHireAttestation({
      ...ok,
      inductionEvidenceId: null,
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(
      r.errors.find((e) => e.field === "inductionEvidenceId")?.code,
    ).toBe("MISSING");
  });

  it("accumulates all errors at once (single pass)", () => {
    const r = validateLabourHireAttestation({});
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    const fields = r.errors.map((e) => e.field).sort();
    expect(fields).toEqual([
      "awardClass",
      "hours",
      "inductionEvidenceId",
      "superRate",
    ]);
  });
});

describe("validateLabourHireAttestation — Fair Work / SG", () => {
  it("rejects superRate below 12% (Super Guarantee minimum)", () => {
    const r = validateLabourHireAttestation({ ...ok, superRate: 0.115 });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.errors[0].code).toBe("BELOW_SG_MIN");
  });

  it("accepts exactly 12%", () => {
    const r = validateLabourHireAttestation({ ...ok, superRate: 0.12 });
    expect(r.ok).toBe(true);
  });
});

describe("validateLabourHireAttestation — hours range", () => {
  it("rejects 0 hours", () => {
    const r = validateLabourHireAttestation({ ...ok, hours: 0 });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.errors[0].code).toBe("OUT_OF_RANGE");
  });

  it("rejects negative hours", () => {
    const r = validateLabourHireAttestation({ ...ok, hours: -1 });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.errors[0].code).toBe("OUT_OF_RANGE");
  });

  it("rejects hours over the 168 cap (typo guard)", () => {
    const r = validateLabourHireAttestation({ ...ok, hours: 4500 });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.errors[0].code).toBe("OUT_OF_RANGE");
  });

  it("accepts the boundary 168", () => {
    const r = validateLabourHireAttestation({ ...ok, hours: 168 });
    expect(r.ok).toBe(true);
  });

  it("rejects non-numeric hours strings", () => {
    const r = validateLabourHireAttestation({ ...ok, hours: "seven" });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.errors[0].code).toBe("INVALID_NUMBER");
  });
});

describe("validateLabourHireAttestation — portable LSL state", () => {
  it("rejects an unknown state code", () => {
    const r = validateLabourHireAttestation({
      ...ok,
      portableLslState: "WA",
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.errors[0].code).toBe("INVALID_STATE");
  });

  it("accepts any of the 5 listed states", () => {
    for (const s of LABOUR_HIRE_PORTABLE_LSL_STATES) {
      const r = validateLabourHireAttestation({
        ...ok,
        portableLslState: s,
      });
      expect(r.ok).toBe(true);
    }
  });

  it("accepts empty string as null (form's blank field)", () => {
    const r = validateLabourHireAttestation({
      ...ok,
      portableLslState: "",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.normalised.portableLslState).toBeNull();
  });
});
