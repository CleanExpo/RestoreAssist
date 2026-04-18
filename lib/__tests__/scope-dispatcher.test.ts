/**
 * RA-867: Unit tests for scope-dispatcher.
 *
 * Covers all 5 damage categories (water/fire/mould/storm/biohazard),
 * multi-loss dispatch, exact-match fallbacks, and category listing.
 */

import { describe, it, expect } from "vitest";
import {
  dispatchScope,
  listChecklistIds,
  listByCategory,
} from "../scope-dispatcher";

// ─── Water ────────────────────────────────────────────────────────────────────

describe("dispatchScope — water", () => {
  it("Cat 1 Class 1 returns exact template", () => {
    const r = dispatchScope({
      damageType: "WATER",
      waterCategory: "1",
      waterClass: "1",
    });
    expect(r.primary.id).toBe("water-cat1-class1");
    expect(r.categories).toEqual(["water"]);
    expect(r.secondary).toHaveLength(0);
  });

  it("Cat 2 Class 2 returns exact template", () => {
    const r = dispatchScope({
      damageType: "WATER",
      waterCategory: "2",
      waterClass: "2",
    });
    expect(r.primary.id).toBe("water-cat2-class2");
  });

  it("Cat 3 water routes to biohazard-sewage", () => {
    const r = dispatchScope({
      damageType: "WATER",
      waterCategory: "3",
      waterClass: "3",
    });
    expect(r.primary.id).toBe("biohazard-sewage");
    expect(r.categories).toEqual(["biohazard"]);
  });

  it("falls back to first water template when class missing", () => {
    const r = dispatchScope({
      damageType: "WATER",
      waterCategory: "1",
      waterClass: null,
    });
    expect(r.primary.category).toBe("water");
    expect(r.primary.damageClass?.startsWith("1")).toBe(true);
  });

  it("falls back to any water template when both missing", () => {
    const r = dispatchScope({ damageType: "WATER" });
    expect(r.primary.category).toBe("water");
  });
});

// ─── Fire ─────────────────────────────────────────────────────────────────────

describe("dispatchScope — fire", () => {
  it("FIRE returns fire-smoke template", () => {
    const r = dispatchScope({ damageType: "FIRE" });
    expect(r.primary.id).toBe("fire-smoke");
    expect(r.categories).toEqual(["fire"]);
  });
});

// ─── Mould ────────────────────────────────────────────────────────────────────

describe("dispatchScope — mould", () => {
  it("MOULD returns mould-remediation template", () => {
    const r = dispatchScope({ damageType: "MOULD" });
    expect(r.primary.id).toBe("mould-remediation");
    expect(r.categories).toEqual(["mould"]);
  });
});

// ─── Storm ────────────────────────────────────────────────────────────────────

describe("dispatchScope — storm", () => {
  it("STORM without water ingress returns only wind-damage", () => {
    const r = dispatchScope({
      damageType: "STORM",
      stormWaterIngress: false,
    });
    expect(r.primary.id).toBe("storm-wind-damage");
    expect(r.secondary).toHaveLength(0);
    expect(r.categories).toEqual(["storm"]);
  });

  it("STORM with water ingress includes storm-water-ingress as secondary", () => {
    const r = dispatchScope({
      damageType: "STORM",
      stormWaterIngress: true,
    });
    expect(r.primary.id).toBe("storm-wind-damage");
    expect(r.secondary.map((c) => c.id)).toContain("storm-water-ingress");
    expect(r.all).toHaveLength(2);
  });
});

// ─── Biohazard ────────────────────────────────────────────────────────────────

describe("dispatchScope — biohazard", () => {
  it("defaults biohazard to sewage", () => {
    const r = dispatchScope({ damageType: "BIOHAZARD" });
    expect(r.primary.id).toBe("biohazard-sewage");
  });

  it("biohazardSubtype='trauma' returns trauma template", () => {
    const r = dispatchScope({
      damageType: "BIOHAZARD",
      biohazardSubtype: "trauma",
    });
    expect(r.primary.id).toBe("biohazard-trauma");
    expect(r.primary.category).toBe("biohazard");
  });

  it("biohazardSubtype='sewage' returns sewage template", () => {
    const r = dispatchScope({
      damageType: "BIOHAZARD",
      biohazardSubtype: "sewage",
    });
    expect(r.primary.id).toBe("biohazard-sewage");
  });
});

// ─── Multi-loss ───────────────────────────────────────────────────────────────

describe("dispatchScope — multi-loss", () => {
  it("STORM+water ingress + secondary MOULD merges all three checklists", () => {
    const r = dispatchScope({
      damageType: "STORM",
      stormWaterIngress: true,
      secondaryDamageTypes: ["MOULD"],
    });
    expect(r.primary.id).toBe("storm-wind-damage");
    const ids = r.all.map((c) => c.id);
    expect(ids).toContain("storm-water-ingress");
    expect(ids).toContain("mould-remediation");
    expect(r.categories).toEqual(expect.arrayContaining(["storm", "mould"]));
  });

  it("deduplicates — primary not repeated in secondary", () => {
    const r = dispatchScope({
      damageType: "FIRE",
      secondaryDamageTypes: ["FIRE"], // intentional duplicate
    });
    expect(r.all.filter((c) => c.id === "fire-smoke")).toHaveLength(1);
  });

  it("MULTI_LOSS without secondaries falls back to water Cat 1 default", () => {
    const r = dispatchScope({ damageType: "MULTI_LOSS" });
    expect(r.primary.category).toBe("water");
  });

  it("supports water + fire + mould stacked (catastrophic loss)", () => {
    const r = dispatchScope({
      damageType: "WATER",
      waterCategory: "2",
      waterClass: "2",
      secondaryDamageTypes: ["FIRE", "MOULD"],
    });
    const ids = r.all.map((c) => c.id);
    expect(ids).toContain("water-cat2-class2");
    expect(ids).toContain("fire-smoke");
    expect(ids).toContain("mould-remediation");
    expect(r.categories).toEqual(
      expect.arrayContaining(["water", "fire", "mould"]),
    );
  });
});

// ─── Fallbacks ────────────────────────────────────────────────────────────────

describe("dispatchScope — fallbacks", () => {
  it("GENERAL returns a water template (safest default)", () => {
    const r = dispatchScope({ damageType: "GENERAL" });
    expect(r.primary.category).toBe("water");
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

describe("listChecklistIds / listByCategory", () => {
  it("listChecklistIds returns all registered checklists", () => {
    const ids = listChecklistIds();
    expect(ids.length).toBeGreaterThanOrEqual(8); // 3 water + 1 fire + 1 mould + 2 storm + 2 biohazard
    expect(ids).toEqual(
      expect.arrayContaining([
        "water-cat1-class1",
        "fire-smoke",
        "mould-remediation",
        "storm-wind-damage",
        "storm-water-ingress",
        "biohazard-sewage",
        "biohazard-trauma",
      ]),
    );
  });

  it("listByCategory('storm') returns both storm templates", () => {
    const storm = listByCategory("storm");
    expect(storm.map((c) => c.id)).toEqual(
      expect.arrayContaining(["storm-wind-damage", "storm-water-ingress"]),
    );
  });

  it("listByCategory('biohazard') returns both biohazard templates", () => {
    const bio = listByCategory("biohazard");
    expect(bio.map((c) => c.id)).toEqual(
      expect.arrayContaining(["biohazard-sewage", "biohazard-trauma"]),
    );
  });
});
