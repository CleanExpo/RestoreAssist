/**
 * RA-7005 Wave 4 — PPE guardrail tests. Lock the safety-critical mappings:
 * Cat 3 and active mould escalate RPE + require decontamination; asbestos hard-
 * stops; strictest hazard wins when several co-occur.
 */
import { describe, it, expect } from "vitest";
import { requiredPpe, summarisePpe } from "../ppe-requirements";

describe("requiredPpe — water categories", () => {
  it("Category 1 needs only basic PPE, no respirator", () => {
    const p = requiredPpe({ waterCategory: "1" });
    expect(p.respiratory).toBe("none");
    expect(p.decontamination).toBe(false);
    expect(p.items).toContain("Safety footwear");
  });

  it("Category 2 requires P2 + coveralls", () => {
    const p = requiredPpe({ waterCategory: "2" });
    expect(p.respiratory).toBe("P2");
    expect(p.items).toContain("Coveralls");
  });

  it("Category 3 requires P3 + impervious coveralls + decontamination", () => {
    const p = requiredPpe({ waterCategory: "3" });
    expect(p.respiratory).toBe("P3");
    expect(p.decontamination).toBe(true);
    expect(p.items.some((i) => /impervious/i.test(i))).toBe(true);
    expect(p.references.some((r) => /S500/.test(r))).toBe(true);
  });
});

describe("requiredPpe — mould", () => {
  it("Condition 2 requires P2 + hooded coveralls + goggles", () => {
    const p = requiredPpe({ mouldCondition: 2 });
    expect(p.respiratory).toBe("P2");
    expect(p.items).toContain("Sealed goggles");
  });

  it("Condition 3 escalates to P3 with fit-test + decon", () => {
    const p = requiredPpe({ mouldCondition: 3 });
    expect(p.respiratory).toBe("P3");
    expect(p.decontamination).toBe(true);
    expect(p.escalations.join(" ")).toMatch(/fit-test|PAPR|Condition 3/i);
    expect(p.references.some((r) => /S520/.test(r))).toBe(true);
  });
});

describe("requiredPpe — escalations + strictest-wins", () => {
  it("asbestos returns a hard-stop escalation", () => {
    const p = requiredPpe({ asbestos: true });
    expect(p.escalations.join(" ")).toMatch(/ASBESTOS|licensed/i);
  });

  it("biohazard forces P3 + decontamination", () => {
    const p = requiredPpe({ biohazard: true });
    expect(p.respiratory).toBe("P3");
    expect(p.decontamination).toBe(true);
  });

  it("fire/smoke soot requires at least P2 + skin cover + S700 reference (RA soak: firesmoke-ppe-gap)", () => {
    const p = requiredPpe({ fireSmoke: true });
    expect(["P2", "P3", "PAPR"]).toContain(p.respiratory);
    expect(p.items).toContain("Coveralls");
    expect(p.references.some((r) => /S700/.test(r))).toBe(true);
  });

  it("fire/smoke never downgrades a stricter co-hazard (Cat 3 stays P3 + decon)", () => {
    const p = requiredPpe({ waterCategory: "3", fireSmoke: true });
    expect(p.respiratory).toBe("P3");
    expect(p.decontamination).toBe(true);
  });

  it("co-occurring hazards take the strictest RPE + union of items", () => {
    const p = requiredPpe({ waterCategory: "2", mouldCondition: 3 });
    expect(p.respiratory).toBe("P3"); // mould C3 beats Cat2 P2
    expect(p.items).toContain("Coveralls"); // from Cat2
    expect(p.items).toContain("Disposable hooded coveralls"); // from mould
  });
});

describe("summarisePpe", () => {
  it("renders a readable one-liner", () => {
    const s = summarisePpe(requiredPpe({ waterCategory: "3" }));
    expect(s).toMatch(/P3 respiratory protection/);
    expect(s).toMatch(/decontamination on exit/);
  });
});
