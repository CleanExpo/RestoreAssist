/**
 * RA-7005 Wave 5 — recommendation-engine tests. Lock the caution-class coverage:
 * Cat 3 / mould / biohazard / meth / fire pull the mandatory occupant-safety,
 * contents, perishables, secondary-damage and (where relevant) specialty-drying
 * items; a clean Cat 1 loss stays lean.
 */
import { describe, it, expect } from "vitest";
import {
  CLAIM_HAZARD_FLAGS,
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
        (r) =>
          r.category === "specialty_drying" &&
          /bound water|Class 4/i.test(r.text),
      ),
    ).toBe(true);
  });
});

describe("claimRecommendations — meth + fire", () => {
  it("meth requires unoccupied-until-clearance", () => {
    const recs = claimRecommendations({ chemical: true });
    expect(
      recs.some(
        (r) => r.category === "habitability" && /clearance/i.test(r.text),
      ),
    ).toBe(true);
  });
  it("fire/smoke adds corrosion/off-gassing secondary damage", () => {
    const recs = claimRecommendations({ fireSmoke: true });
    expect(
      recs.some(
        (r) =>
          r.category === "secondary_damage" &&
          /smoke|off.?gas|corrode/i.test(r.text),
      ),
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
    const recs = claimRecommendations({
      waterCategory: "3",
      mouldCondition: 3,
    });
    expect(recs.length).toBeGreaterThan(8);
    for (const r of recs) {
      expect(r.clause.length).toBeGreaterThan(3);
      expect(["caution", "required", "advisory"]).toContain(r.severity);
    }
  });
});

// ── RA-8276 guards ──────────────────────────────────────────────────────────

const WATER_ONLY =
  /wet.?floor|block-and-elevate|psychrometric|moisture logs|tannin|water.?mark/i;

describe("RA-8276 defect 1: water items only when water is present", () => {
  it("a dry fire job gets no water-only items", () => {
    const recs = claimRecommendations({ fireSmoke: true });
    const leaks = recs.filter((r) => WATER_ONLY.test(r.text));
    expect(leaks.map((r) => r.text)).toEqual([]);
  });
  it("a dry fire job still gets contents and documentation items", () => {
    const c = cats(claimRecommendations({ fireSmoke: true }));
    expect(c.has("contents")).toBe(true);
    expect(c.has("documentation")).toBe(true);
  });
  it.each([
    [{ waterCategory: "2" as const }],
    [{ waterClass: 2 }],
    [{ fireSmoke: true, waterCategory: "1" as const }],
  ])("water present (%o) keeps the water items", (h) => {
    const txt = claimRecommendations(h)
      .map((r) => r.text)
      .join(" ");
    expect(txt).toMatch(/wet.?floor/i);
    expect(txt).toMatch(/block-and-elevate/i);
    expect(txt).toMatch(/psychrometric/i);
    expect(txt).toMatch(/tannin/i);
  });
});

describe("RA-8276 defect 2: working at height is required for high-level scope", () => {
  const height = (h: Parameters<typeof claimRecommendations>[0]) =>
    claimRecommendations(h).find((r) => /working at height/i.test(r.text));

  it.each([
    ["fire/smoke clean (ceilings in scope)", { fireSmoke: true }],
    [
      "ceilings, fittings, fans, high windows or HVAC heads",
      { highLevelWork: true },
    ],
    ["two storeys", { storeys: 2 }],
    ["ceiling at 2.4 m", { ceilingHeightM: 2.4 }],
  ])("required for %s", (_label, h) => {
    const rec = height(h);
    expect(rec?.severity).toBe("required");
    expect(rec?.text).not.toMatch(/ceiling\/cornice moisture/i);
  });

  it("fire wording names the actual high-level tasks", () => {
    expect(height({ fireSmoke: true })?.text).toMatch(/light fittings/i);
  });

  it("a single-storey, low-ceiling water job stays advisory", () => {
    expect(
      height({ waterCategory: "1", storeys: 1, ceilingHeightM: 2.3 })?.severity,
    ).toBe("advisory");
  });
});

/**
 * RA-8276 review round 3: a dry job with another hazard (biohazard, chemical,
 * mould, unoccupied at loss) still pulled water-only wording and S500 clauses
 * from the contaminated and security branches. Every combination of the
 * non-water hazard flags, with no water, must carry no water wording.
 */
describe("RA-8276: no water wording on any dry hazard combination", () => {
  const DRY_LEAK =
    /S500|contaminated water|Category.?3|air.?mover|dehumidif|\bdrying\b|psychromet|wet.?floor|block-and-elevate|tannin|moisture checks/i;
  // Round 8: every on/off input except waterPresent, so a new flag is
  // covered automatically (a hand-picked list missed timberFloorCupping).
  const flags = CLAIM_HAZARD_FLAGS.filter((f) => f !== "waterPresent");
  type H = Parameters<typeof claimRecommendations>[0];
  const combos: H[] = [];
  for (let m = 0; m < 1 << flags.length; m++) {
    for (const mould of [null, 2, 3] as const) {
      const h: H = { mouldCondition: mould };
      flags.forEach((f, i) => {
        if (m & (1 << i)) h[f] = true;
      });
      combos.push(h);
    }
  }

  it.each(combos)("dry %o carries no water wording or S500 clause", (h) => {
    const leaks = claimRecommendations(h)
      .filter((r) => DRY_LEAK.test(`${r.text} ${r.clause}`))
      .map((r) => `${r.category}: ${r.text.slice(0, 60)} [${r.clause}]`);
    expect(leaks).toEqual([]);
  });

  it("dry cupping gets a cause check, not specialty drying", () => {
    const recs = claimRecommendations({
      fireSmoke: true,
      timberFloorCupping: true,
    });
    expect(recs.some((r) => r.category === "specialty_drying")).toBe(false);
    expect(recs.map((r) => r.text).join(" ")).toMatch(
      /Floor cupping is recorded/,
    );
  });

  it("cupping with water keeps specialty drying", () => {
    const recs = claimRecommendations({
      waterCategory: "1",
      timberFloorCupping: true,
    });
    expect(recs.some((r) => r.category === "specialty_drying")).toBe(true);
    expect(recs.map((r) => r.text).join(" ")).not.toMatch(
      /Floor cupping is recorded/,
    );
  });

  it("Category 3 water keeps its water items unchanged", () => {
    const txt = claimRecommendations({ waterCategory: "3", biohazard: true })
      .map((r) => `${r.text} ${r.clause}`)
      .join(" ");
    expect(txt).toMatch(/contaminated water/i);
    expect(txt).toMatch(/S500/);
    expect(txt).toMatch(/unoccupied drying/i);
  });

  it("dry contaminated jobs still get the occupant-safety items", () => {
    const got = claimRecommendations({ biohazard: true }).map(
      (r) => r.category,
    );
    for (const c of [
      "habitability",
      "security",
      "contents",
      "perishables",
      "soft_goods",
    ]) {
      expect(got).toContain(c);
    }
  });
});
