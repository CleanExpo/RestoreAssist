/**
 * RA-8276 step 1: Claim Pathway engine acceptance tests.
 *
 * Fixtures carry no personal data. "Kalolo" is the worked fire example from
 * the ticket reduced to its facts: fire, light protein smoke, 2 storeys,
 * built 2021, furnished, HVAC unknown, kitchen origin, no water.
 */
import { describe, it, expect } from "vitest";
import {
  composePathway,
  PRICING_LINE,
  UnknownClaimTypeError,
} from "../compose-pathway";
import { PATHWAY_SECTIONS, type ClaimFacts, type PathwayItem } from "../types";
import { standardCite } from "@/lib/nir-standards-mapping";
import { JOB_TYPES } from "@/lib/evidence/workflow-definitions";

const KALOLO: ClaimFacts = {
  claimType: "FIRE_SMOKE",
  property: {
    storeys: 2,
    buildYear: 2021,
    furnished: true,
    hvacType: "unknown",
  },
  loss: {
    originRoom: "kitchen",
    smokeColour: "light protein smoke",
    smokeResidueHint: "protein",
  },
};

const WATER_CAT2_CLASS2: ClaimFacts = {
  claimType: "WATER_DAMAGE",
  property: {
    storeys: 1,
    buildYear: 1985,
    furnished: true,
    ceilingHeightM: 2.4,
  },
  loss: {
    lossDate: "2026-11-01",
    originRoom: "laundry",
    waterCategory: "2",
    waterClass: 2,
    affectedRooms: ["laundry", "hallway"],
  },
};

const MOULD_C3: ClaimFacts = {
  claimType: "MOULD",
  hazards: { mouldCondition: 3 },
  property: { storeys: 1, buildYear: 2010, furnished: false, hvacType: "none" },
  loss: { originRoom: "bathroom", affectedRooms: ["bathroom"] },
};

/** Water-specific wording. "Fire and water damage" in an asbestos note is not a water item. */
const WATER_ITEM =
  /wet.?floor|block-and-elevate|psychromet|dew point|moisture|tannin|water.?mark|drying|dehumidif|water categor|water class/i;

const itemText = (i: PathwayItem) =>
  [
    i.action,
    i.why,
    i.guidance.apprentice,
    i.guidance.experienced,
    ...i.basis,
  ].join(" ");
const byId = (items: PathwayItem[], id: string) =>
  items.find((i) => i.id === id);

describe("Kalolo fire fixture (acceptance)", () => {
  const p = composePathway(KALOLO);
  const items = p.techPathway;

  it("standards are led by S700", () => {
    expect(p.standards[0]).toBe("S700");
    expect(items.find((i) => i.section === "standards")?.basis).toEqual([
      `IICRC ${standardCite("S700")}`,
    ]);
  });

  it("has no water item anywhere", () => {
    expect(p.waterPresent).toBe(false);
    expect(p.standards).not.toContain("S500");
    const leaks = items.filter((i) => WATER_ITEM.test(itemText(i)));
    expect(leaks.map((i) => i.id)).toEqual([]);
    const moisture = items.filter((i) =>
      i.evidence.some((e) => e.evidenceClass === "MOISTURE_READING"),
    );
    expect(moisture.map((i) => i.id)).toEqual([]);
    const brief = JSON.stringify(p.customerBrief);
    expect(brief).not.toMatch(WATER_ITEM);
    const s500 = items.filter((i) => i.basis.some((b) => /S500/.test(b)));
    expect(s500.map((i) => i.id)).toEqual([]);
    expect(items.map(itemText).join(" ")).not.toMatch(/air.?mover/i);
  });

  it("working at height is required", () => {
    expect(byId(items, "safety.working-at-height")?.severity).toBe("required");
  });

  it("PPE is P2", () => {
    expect(p.ppe.respiratory).toBe("P2");
    expect(byId(items, "ppe.set")?.action).toMatch(/P2 respiratory protection/);
    expect(byId(items, "ppe.fit-test")).toBeDefined();
  });

  it("has an investigate item for the HVAC type", () => {
    expect(byId(items, "investigate.hvac-type")?.section).toBe("investigate");
  });

  it("has residue, odour and cleanability test items", () => {
    expect(byId(items, "evidence.residue-test")?.evidence[0].type).toBe("test");
    expect(byId(items, "evidence.odour-baseline-clearance")).toBeDefined();
    expect(byId(items, "evidence.cleanability-patch")?.evidence[0].type).toBe(
      "test",
    );
  });

  it("every item is proposed", () => {
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.status === "proposed")).toBe(true);
  });

  it("covers the rest of the missing fire checks", () => {
    expect(byId(items, "safety.electrical-near-origin")?.action).toMatch(
      /kitchen/,
    );
    expect(byId(items, "scope.contents-sort")?.action).toMatch(
      /clean on site.*pack out.*non-salvageable/i,
    );
    expect(byId(items, "scope.storage-plan")).toBeDefined();
    expect(byId(items, "investigate.hvac-ran")).toBeDefined();
  });

  it("treats the reported residue as provisional", () => {
    expect(byId(items, "investigate.residue-type")?.action).toMatch(/protein/);
  });

  it("asbestos is advisory for a 2021 build", () => {
    expect(byId(items, "safety.asbestos")?.severity).toBe("advisory");
  });

  it("customer brief has no prices, only the fixed pricing line", () => {
    const lines = Object.values(p.customerBrief).flatMap((s) => s.lines);
    expect(lines.join(" ")).not.toMatch(
      /\$\s?\d|\bAUD\b|\d+\s?(dollars|cents)/i,
    );
    const pricing = lines.filter((l) =>
      /\bprices?\b|\bcosts?\b|\brates?\b/i.test(l),
    );
    expect(pricing).toEqual([PRICING_LINE]);
    expect(p.customerBrief.properScope.lines).toContain(PRICING_LINE);
  });
});

describe("Water Category 2 / Class 2 fixture", () => {
  const p = composePathway(WATER_CAT2_CLASS2);
  const items = p.techPathway;

  it("is led by S500 with no fire standard", () => {
    expect(p.standards).toEqual(["S500"]);
  });
  it("needs P2 PPE for Category 2", () => {
    expect(p.ppe.respiratory).toBe("P2");
  });
  it("keeps the water items and moisture evidence", () => {
    const txt = items.map(itemText).join(" ");
    expect(txt).toMatch(/wet.?floor/i);
    expect(txt).toMatch(/psychrometric/i);
    expect(
      items.some((i) =>
        i.evidence.some((e) => e.evidenceClass === "MOISTURE_READING"),
      ),
    ).toBe(true);
  });
  it("includes the contamination assessment for Category 2", () => {
    expect(byId(items, "workflow.contamination_assessment")).toBeDefined();
  });
  it("explains the water scope to the customer", () => {
    const scope = p.customerBrief.properScope.lines.join(" ");
    expect(scope).toMatch(/moisture survey/i);
    expect(scope).toMatch(/final readings at the drying goal/i);
  });
  it("has no fire checks", () => {
    expect(byId(items, "evidence.residue-test")).toBeUndefined();
    expect(byId(items, "investigate.hvac-type")).toBeUndefined();
  });
  it("asbestos check is required for a 1985 build", () => {
    expect(byId(items, "safety.asbestos")?.severity).toBe("required");
  });
  it("working at height is required for 2.4 m ceilings", () => {
    expect(byId(items, "safety.working-at-height")?.severity).toBe("required");
  });
  it("asks nothing it already knows", () => {
    for (const id of [
      "investigate.water-category",
      "investigate.water-class",
      "investigate.storeys",
      "investigate.loss-date",
    ]) {
      expect(byId(items, id), id).toBeUndefined();
    }
  });
});

describe("Mould Condition 3 fixture", () => {
  const p = composePathway(MOULD_C3);
  const items = p.techPathway;

  it("is led by S520 with no water standard", () => {
    expect(p.standards).toEqual(["S520"]);
    expect(p.waterPresent).toBe(false);
  });
  it("needs P3 with a fit-test item", () => {
    expect(p.ppe.respiratory).toBe("P3");
    expect(byId(items, "ppe.fit-test")?.action).toMatch(/P3/);
  });
  it("includes mould sampling and habitability items", () => {
    expect(byId(items, "workflow.mould_sampling")).toBeDefined();
    expect(items.some((i) => i.id.startsWith("rec.habitability"))).toBe(true);
  });
  it("explains the mould scope to the customer", () => {
    expect(p.customerBrief.properScope.lines.join(" ")).toMatch(
      /mould assessment/i,
    );
  });
  it("adds no wet-floor or block-and-elevate items", () => {
    const txt = items.map((i) => i.action).join(" ");
    expect(txt).not.toMatch(/wet.?floor|block-and-elevate/i);
  });
  it("skips HVAC questions when there is no HVAC", () => {
    expect(byId(items, "investigate.hvac-type")).toBeUndefined();
    expect(byId(items, "investigate.hvac-ran")).toBeUndefined();
  });
});

describe("Unknown facts become investigate items", () => {
  const p = composePathway({ claimType: "fire" });
  const ids = p.techPathway.map((i) => i.id);

  it.each([
    "investigate.loss-date",
    "investigate.origin",
    "investigate.affected-rooms",
    "investigate.storeys",
    "investigate.ceiling-height",
    "investigate.build-year",
    "investigate.furnished",
    "investigate.residue-type",
    "investigate.hvac-type",
    "investigate.hvac-ran",
  ])("%s", (id) => {
    expect(ids).toContain(id);
  });

  it("unknown build year makes the asbestos check required", () => {
    expect(
      p.techPathway.find((i) => i.id === "safety.asbestos")?.severity,
    ).toBe("required");
  });

  it("does not invent contents steps when furnished is unknown", () => {
    expect(ids).not.toContain("scope.contents-sort");
  });

  it("puts unknowns in the customer brief's to-confirm list", () => {
    expect(p.customerBrief.toConfirm.lines.length).toBeGreaterThanOrEqual(10);
  });
});

describe("Asbestos rule (lead-verified: before 2004 or unknown is required)", () => {
  const asbestos = (facts: ClaimFacts) =>
    composePathway(facts).techPathway.find((i) => i.id === "safety.asbestos");
  it.each([
    [2003, "required"],
    [2004, "advisory"],
  ])("build year %i is %s", (buildYear, severity) => {
    expect(
      asbestos({ claimType: "WATER_DAMAGE", property: { buildYear } })
        ?.severity,
    ).toBe(severity);
  });
  it("suspected asbestos is a required stop whatever the build year", () => {
    const item = asbestos({
      claimType: "FIRE_SMOKE",
      hazards: { asbestos: true },
      property: { buildYear: 2021 },
    });
    expect(item?.severity).toBe("required");
    expect(item?.action).toMatch(/stop/i);
  });
});

describe("HVAC that ran after the fire", () => {
  it("requires the duct and filter inspection", () => {
    const p = composePathway({
      ...KALOLO,
      property: {
        ...KALOLO.property,
        hvacType: "ducted",
        hvacRanSinceLoss: true,
      },
    });
    expect(
      p.techPathway.find((i) => i.id === "evidence.hvac-ducts-filters")
        ?.severity,
    ).toBe("required");
  });
});

describe("Storm without known water entry", () => {
  const ids = (f: ClaimFacts) => composePathway(f).techPathway.map((i) => i.id);
  it("leaves the water-only steps out and asks whether water got in", () => {
    const dry = ids({ claimType: "STORM" });
    expect(dry).toContain("investigate.storm-water-entry");
    for (const id of [
      "workflow.environmental_readings",
      "workflow.moisture_survey",
      "workflow.progress_monitoring",
    ]) {
      expect(dry, id).not.toContain(id);
    }
  });
  it("adds them back once water is known", () => {
    const wet = ids({ claimType: "STORM", loss: { waterClass: 2 } });
    expect(wet).toContain("workflow.moisture_survey");
    expect(wet).not.toContain("investigate.storm-water-entry");
  });
});

describe("Fire with water present", () => {
  const p = composePathway({
    ...KALOLO,
    loss: { ...KALOLO.loss, waterCategory: "1" },
  });
  it("adds S500 after S700 and the final moisture readings", () => {
    expect(p.standards.slice(0, 2)).toEqual(["S700", "S500"]);
    expect(
      p.techPathway.some((i) => i.id === "evidence.final-moisture-readings"),
    ).toBe(true);
    expect(p.techPathway.some((i) => i.id === "workflow.moisture_survey")).toBe(
      true,
    );
  });
});

describe("WHS citations", () => {
  it("names NSW regulation rows only for NSW properties", () => {
    const other = composePathway(KALOLO);
    const nsw = composePathway({
      ...KALOLO,
      property: { ...KALOLO.property, state: "NSW" },
    });
    const basis = (p: typeof other) =>
      p.techPathway.flatMap((i) => i.basis).join(" ");
    expect(basis(other)).not.toMatch(/NSW Government/);
    expect(basis(nsw)).toMatch(
      /Regulation 2017 \(NSW\), Part 4\.4 Falls, clauses 78-80/,
    );
  });
  it("never shows the unverified PPE clause number", () => {
    const nsw = composePathway({
      ...KALOLO,
      property: { ...KALOLO.property, state: "NSW" },
    });
    const all = JSON.stringify(nsw);
    expect(all).toMatch(/Regulation 2017 \(NSW\)/);
    expect(all).not.toMatch(/clause 44/);
  });
});

describe("Shape and determinism", () => {
  it.each([KALOLO, WATER_CAT2_CLASS2, MOULD_C3])(
    "is deterministic (%#)",
    (f) => {
      expect(JSON.stringify(composePathway(f))).toBe(
        JSON.stringify(composePathway(f)),
      );
    },
  );
  it("orders items by section, with no protection items yet", () => {
    const ranks = composePathway(KALOLO).techPathway.map((i) =>
      PATHWAY_SECTIONS.indexOf(i.section),
    );
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(ranks).not.toContain(PATHWAY_SECTIONS.indexOf("protection"));
  });
  it("gives every item a unique id, guidance and evidence (standards excepted)", () => {
    for (const f of [KALOLO, WATER_CAT2_CLASS2, MOULD_C3]) {
      const items = composePathway(f).techPathway;
      expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
      for (const i of items) {
        expect(i.guidance.apprentice, i.id).not.toBe("");
        expect(i.guidance.experienced, i.id).not.toBe("");
        if (i.section !== "standards")
          expect(i.evidence.length, i.id).toBeGreaterThan(0);
      }
    }
  });
  it("covers every claim type without throwing", async () => {
    const { JOB_TYPES } = await import("@/lib/evidence/workflow-definitions");
    for (const t of JOB_TYPES) {
      expect(composePathway({ claimType: t }).claimType).toBe(t);
    }
  });
  it("rejects an unknown claim type", () => {
    expect(() => composePathway({ claimType: "volcano" })).toThrow(
      UnknownClaimTypeError,
    );
  });
});

/**
 * RA-8276 review round 3: every claim type with no water, with every
 * combination of the extra hazard flags, must carry no water wording or S500
 * basis. Mould claims and mould hazards keep moisture wording (a mould job
 * needs its moisture source found), so for those only S500 and drying
 * equipment are checked.
 */
describe("RA-8276: dry claims with mixed hazards stay dry", () => {
  const STRICT =
    /wet.?floor|block-and-elevate|psychromet|dew point|moisture|tannin|water.?mark|drying|dehumidif|water categor|water class|contaminated water|Category.?3|air.?mover|S500/i;
  const MOULD_SAFE =
    /S500|contaminated water|Category.?3|air.?mover|dehumidif|psychromet/i;
  const flags = [
    "biohazard",
    "chemical",
    "asbestos",
    "unoccupiedAtLoss",
  ] as const;
  const cases: [string, number, ClaimFacts][] = [];
  for (const claimType of JOB_TYPES) {
    if (composePathway({ claimType }).waterPresent) continue;
    for (let m = 0; m < 1 << flags.length; m++) {
      for (const mould of [null, 3] as const) {
        const hazards: NonNullable<ClaimFacts["hazards"]> = {
          mouldCondition: mould,
        };
        flags.forEach((f, i) => {
          if (m & (1 << i)) hazards[f] = true;
        });
        cases.push([claimType, m * 10 + (mould ?? 0), { claimType, hazards }]);
      }
    }
  }

  it("covers at least the fire, mould and biohazard claim types", () => {
    const types = new Set(cases.map((c) => c[0]));
    expect(types.has("FIRE_SMOKE")).toBe(true);
    expect(types.size).toBeGreaterThanOrEqual(3);
  });

  it.each(cases)("%s combo %i", (claimType, _n, facts) => {
    const p = composePathway(facts);
    expect(p.waterPresent).toBe(false);
    const mouldy =
      claimType === "MOULD" || facts.hazards?.mouldCondition != null;
    const re = mouldy ? MOULD_SAFE : STRICT;
    // A mould claim's own template steps (moisture survey, drying) are
    // mould work under S520; only the recommendation items are checked.
    const leaks = p.techPathway
      .filter((i) => !(claimType === "MOULD" && i.id.startsWith("workflow.")))
      .filter((i) => re.test(itemText(i)))
      .map((i) => i.id);
    expect(leaks).toEqual([]);
    if (!mouldy) expect(JSON.stringify(p.customerBrief)).not.toMatch(STRICT);
    if (claimType !== "MOULD") {
      const moisture = p.techPathway.filter((i) =>
        i.evidence.some((e) => e.evidenceClass === "MOISTURE_READING"),
      );
      expect(moisture.map((i) => i.id)).toEqual([]);
    }
  });
});
