/**
 * RA-7005 Wave 5 — recommendation-engine tests. Lock the caution-class coverage:
 * Cat 3 / mould / biohazard / meth / fire pull the mandatory occupant-safety,
 * contents, perishables, secondary-damage and (where relevant) specialty-drying
 * items; a clean Cat 1 loss stays lean.
 */
import { describe, it, expect } from "vitest";
import {
  claimRecommendations,
  isCautionClaim,
  type RecCategory,
} from "../claim-recommendations";

const cats = (recs: { category: RecCategory }[]) =>
  new Set(recs.map((r) => r.category));

describe("claimRecommendations — Category 3 water", () => {
  const recs = claimRecommendations({ waterCategory: "3" });
  it("is a caution claim", () => {
    expect(isCautionClaim({ waterCategory: "3" })).toBe(true);
  });
  it("covers habitability, contents, perishables, soft goods, secondary damage", () => {
    const c = cats(recs);
    expect(c.has("habitability")).toBe(true);
    expect(c.has("contents")).toBe(true);
    expect(c.has("perishables")).toBe(true);
    expect(c.has("soft_goods")).toBe(true);
    expect(c.has("secondary_damage")).toBe(true);
  });
  it("flags pack-out to off-site storage and food disposal", () => {
    const txt = recs.map((r) => r.text).join(" ");
    expect(txt).toMatch(/pack-out .*storage/i);
    expect(txt).toMatch(/food|refrigerator|freezer/i);
  });
});

describe("claimRecommendations — mould + timber cupping (Class 4)", () => {
  const recs = claimRecommendations({
    waterCategory: "3",
    mouldCondition: 3,
    timberFloorCupping: true,
  });
  it("adds specialty (bound-water) drying and pet relocation", () => {
    const c = cats(recs);
    expect(c.has("specialty_drying")).toBe(true);
    expect(c.has("animals_plants")).toBe(true);
    expect(
      recs.some(
        (r) => r.category === "specialty_drying" && /bound water|Class 4/i.test(r.text),
      ),
    ).toBe(true);
  });
});

describe("claimRecommendations — meth + fire", () => {
  it("meth requires unoccupied-until-clearance", () => {
    const recs = claimRecommendations({ chemical: true });
    expect(
      recs.some((r) => r.category === "habitability" && /clearance/i.test(r.text)),
    ).toBe(true);
  });
  it("fire/smoke adds corrosion/off-gassing secondary damage", () => {
    const recs = claimRecommendations({ fireSmoke: true });
    expect(
      recs.some((r) => r.category === "secondary_damage" && /smoke|off.?gas|corrode/i.test(r.text)),
    ).toBe(true);
  });
});

describe("claimRecommendations — clean Category 1 stays lean", () => {
  const recs = claimRecommendations({ waterCategory: "1" });
  it("is not a caution claim and omits contaminated-only items", () => {
    expect(isCautionClaim({ waterCategory: "1" })).toBe(false);
    const c = cats(recs);
    expect(c.has("perishables")).toBe(false); // contaminated-only
    expect(c.has("habitability")).toBe(false); // contaminated-only
    // but universal safety + documentation always present
    expect(c.has("safety")).toBe(true);
    expect(c.has("documentation")).toBe(true);
  });
});

describe("severity + citations", () => {
  it("every recommendation carries a clause citation and a severity", () => {
    const recs = claimRecommendations({ waterCategory: "3", mouldCondition: 3 });
    expect(recs.length).toBeGreaterThan(8);
    for (const r of recs) {
      expect(r.clause.length).toBeGreaterThan(3);
      expect(["caution", "required", "advisory"]).toContain(r.severity);
    }
  });
});
