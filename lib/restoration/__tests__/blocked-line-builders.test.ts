/**
 * RA-8281 (B2): the two document builders, one unset rate at a time.
 *
 * For every price-list field, in several job shapes, that one field is cleared
 * and the document is built. Whatever the field and the job, these hold:
 *
 *   - a line that needs the cleared rate is marked blocked and has no rate
 *     and no amount (never $0);
 *   - a line with no amount is always marked, so nothing is blank silently;
 *   - a category with a blocked line has no total, and a category with no
 *     total shows the blocked line that caused it;
 *   - every total above it (labour, equipment, chemicals, admin, subtotal,
 *     GST, total inc GST) that includes a blocked category is null, and the
 *     cost analysis reads "Total not available: rate not set";
 *   - when no line on the job needs the cleared rate, the document is whole.
 *
 * The route suites show single cases end to end; this holds the rule over the
 * whole grid, so a `?? 0` on any one line or total is caught.
 */
import { describe, expect, it } from "vitest";
import { getEquipmentGroupById } from "@/lib/equipment-matrix";
import { getGstTreatment } from "@/lib/gst-rules";
import { TOTAL_NOT_AVAILABLE_NOTE } from "@/lib/pricing/blocked-line";
import {
  buildCostEstimationData,
  COST_ESTIMATION_RATE_FIELDS,
} from "@/lib/restoration/cost-estimation-builder";
import {
  buildScopeOfWorksData,
  SCOPE_OF_WORKS_RATE_FIELDS,
} from "@/lib/restoration/scope-of-works-builder";

const EQUIPMENT_FIELDS = [
  "dehumidifierLGRDailyRate",
  "dehumidifierDesiccantDailyRate",
  "airMoverAxialDailyRate",
  "airMoverCentrifugalDailyRate",
  "afdUnitLargeDailyRate",
  "injectionDryingSystemDailyRate",
];
const FIELDS = [
  ...new Set([
    ...COST_ESTIMATION_RATE_FIELDS,
    ...SCOPE_OF_WORKS_RATE_FIELDS,
    ...EQUIPMENT_FIELDS,
  ]),
];
const FULL = Object.fromEntries(FIELDS.map((f, i) => [f, 50 + i * 7]));

const JOBS = [
  { tier1: { T1_Q7_hazards: ["None identified"], T1_Q6_materialsAffected: [] }, tier3: null },
  {
    tier1: {
      T1_Q7_hazards: ["Active mould growth", "Biohazard present"],
      T1_Q6_materialsAffected: ["Yellow tongue particleboard"],
      T1_Q3_waterSource: "Sewage",
    },
    tier3: {
      T3_Q1_timelineRequirements: "ASAP",
      T3_Q5_class4DryingAssessment: "Class 4",
      T3_Q3_chemicalTreatment: "Standard antimicrobial treatment",
      T3_Q4_totalAffectedArea: "45 sqm",
    },
  },
  {
    tier1: { T1_Q7_hazards: ["Suspected asbestos"], T1_Q6_materialsAffected: [] },
    tier3: {
      T3_Q5_class4DryingAssessment: "Class 3 or 4",
      T3_Q3_chemicalTreatment: "mould treatment",
      T3_Q2_dryingPreferences: "Speed priority 5 days",
    },
  },
];
const EQUIPMENT = [
  { groupId: "lgr-85", quantity: 2 },
  { groupId: "desiccant-20", quantity: 1 },
  { groupId: "airmover-800", quantity: 3 },
];

function inputs(job: (typeof JOBS)[number], cleared: string | null) {
  return {
    report: {
      id: "rep_1",
      reportNumber: "RA-1",
      waterCategory: "2",
      hazardType: "water damage",
      technicianFieldReport: "Burst flexi hose under the vanity.",
      estimatedDryingDuration: 4,
      inspection: null,
    },
    analysis: null,
    tier1: job.tier1,
    tier2: null,
    tier3: job.tier3,
    pricingConfig: cleared ? { ...FULL, [cleared]: null } : FULL,
    stateInfo: null,
    equipmentSelection: EQUIPMENT,
    scopeAreas: [{ length: 8, width: 5, wetPercentage: 100 }],
  };
}

const cost = (job: (typeof JOBS)[number], cleared: string | null) =>
  buildCostEstimationData({
    ...inputs(job, cleared),
    scopeData: { lineItems: [] },
    gstTreatment: getGstTreatment("AU"),
  }) as any;
const scope = (job: (typeof JOBS)[number], cleared: string | null) =>
  buildScopeOfWorksData(inputs(job, cleared) as never) as any;

const RATE_KEYS = ["rate", "dailyRate", "ratePerSqm"];
const isNumber = (v: unknown) => typeof v === "number" && Number.isFinite(v);

/** Checks one cost document; returns true when it is blocked. */
function checkCost(doc: any): boolean {
  const categories = Object.values(doc.categories) as any[];
  let blockedLines = 0;
  for (const category of categories) {
    let blockedHere = 0;
    for (const item of category.lineItems) {
      if (item.pricingStatus) {
        blockedHere++;
        expect(item.subtotal, `${category.name}: ${item.description}`).toBeNull();
        if (item.pricingStatus === "rate_not_set") {
          for (const key of RATE_KEYS) {
            if (key in item) expect(item[key], `${item.description}.${key}`).toBeNull();
          }
        }
      } else {
        expect(isNumber(item.subtotal), `${category.name}: ${item.description}`).toBe(true);
      }
    }
    blockedLines += blockedHere;
    if (blockedHere > 0) expect(category.total, category.name).toBeNull();
    if (category.total === null) expect(blockedHere, category.name).toBeGreaterThan(0);
  }
  const blocked = blockedLines > 0;
  const nullIf = (names: (name: string) => boolean) =>
    categories.some((c) => names(c.name) && c.total === null);
  const { totals } = doc;
  const expectTotal = (key: string, shouldBlock: boolean) => {
    if (shouldBlock) expect(totals[key], key).toBeNull();
    else expect(isNumber(totals[key]), key).toBe(true);
  };
  expectTotal("totalLabour", nullIf((n) => n.includes("Labour")));
  expectTotal("totalEquipment", nullIf((n) => n.includes("Equipment")));
  expectTotal("totalChemicals", doc.categories.chemicalTreatment?.total === null);
  expectTotal(
    "totalAdmin",
    [doc.categories.administration, doc.categories.callOut, doc.categories.thermalImaging].some(
      (c) => c?.total === null,
    ),
  );
  expectTotal("subtotal", blocked);
  expectTotal("gst", blocked);
  expectTotal("totalIncGST", blocked);
  if (blocked) {
    expect(doc.blockedPricing).toMatchObject({ status: "blocked", total: null });
    expect(doc.industryComparison.analysis).toBe(TOTAL_NOT_AVAILABLE_NOTE);
    expect(doc.industryComparison.estimated).toBeNull();
    expect(
      doc.blockedPricing.lines.filter((l: any) => l.pricingStatus !== "priced"),
    ).toHaveLength(blockedLines);
  } else {
    expect(doc).not.toHaveProperty("blockedPricing");
  }
  return blocked;
}

/** Checks one scope of works; returns true when it is blocked. */
function checkScope(doc: any): boolean {
  let blockedLines = 0;
  for (const item of doc.lineItems) {
    if (item.pricingStatus) {
      blockedLines++;
      expect(item.subtotal, item.id).toBeNull();
    } else {
      expect(isNumber(item.subtotal), item.id).toBe(true);
    }
    for (const group of Object.values(item.equipment ?? {}) as any[]) {
      for (const line of group.items ?? []) {
        // A stored equipment line with no rate is marked on the line itself.
        expect(line.dailyRate === null, `${item.id} ${line.groupId}`).toBe(
          line.pricingStatus !== undefined,
        );
        // Each equipment line is listed in the blocked result under RW_3,
        // so a blocked one counts as a blocked line of its own.
        if (line.pricingStatus) {
          blockedLines++;
          expect(line.total, `${item.id} ${line.groupId}`).toBeNull();
        }
      }
    }
  }
  if (blockedLines > 0) {
    expect(doc.blockedPricing).toMatchObject({ status: "blocked", total: null });
    expect(
      doc.blockedPricing.lines.filter((l: any) => l.pricingStatus !== "priced"),
    ).toHaveLength(blockedLines);
  } else {
    expect(doc).not.toHaveProperty("blockedPricing");
  }
  return blockedLines > 0;
}

describe("RA-8281 B2: each builder with one rate cleared at a time", () => {
  const blockedBy = { cost: new Set<string>(), scope: new Set<string>() };

  it("control: with every rate set both documents are whole", () => {
    for (const job of JOBS) {
      expect(checkCost(cost(job, null))).toBe(false);
      expect(checkScope(scope(job, null))).toBe(false);
    }
  });

  describe.each(FIELDS)("%s cleared", (field) => {
    it.each(JOBS.map((job, i) => [i, job] as const))("cost estimation, job %i", (_i, job) => {
      const doc = cost(job, field);
      if (checkCost(doc)) {
        blockedBy.cost.add(field);
        expect(doc.blockedPricing.missing.map((m: any) => m.field)).toContain(field);
      }
    });

    it.each(JOBS.map((job, i) => [i, job] as const))("scope of works, job %i", (_i, job) => {
      const doc = scope(job, field);
      if (checkScope(doc)) {
        blockedBy.scope.add(field);
        expect(doc.blockedPricing.missing.map((m: any) => m.field)).toContain(field);
      }
    });
  });

  it("positive control: the grid really blocks, on labour, equipment, chemical and fee fields", () => {
    for (const field of [
      "masterQualifiedNormalHours",
      "qualifiedTechnicianNormalHours",
      "labourerNormalHours",
      "dehumidifierLGRDailyRate",
      "dehumidifierDesiccantDailyRate",
      "airMoverAxialDailyRate",
      "administrationFee",
      "callOutFee",
      "thermalCameraUseCostPerAssessment",
    ]) {
      expect(blockedBy.cost.has(field), `cost: ${field}`).toBe(true);
    }
    for (const field of [
      "masterQualifiedNormalHours",
      "qualifiedTechnicianNormalHours",
      "dehumidifierLGRDailyRate",
      "dehumidifierDesiccantDailyRate",
    ]) {
      expect(blockedBy.scope.has(field), `scope: ${field}`).toBe(true);
    }
    expect(blockedBy.cost.size).toBeGreaterThanOrEqual(12);
    expect(blockedBy.scope.size).toBeGreaterThanOrEqual(8);
  });
});

describe("RA-8281 B2: review of #2536", () => {
  const MOULD_JOB = {
    tier1: { T1_Q7_hazards: ["Active mould growth"], T1_Q6_materialsAffected: [] },
    tier3: null,
  } as unknown as (typeof JOBS)[number];
  const chemicalLine = (doc: any) =>
    doc.lineItems.find((item: any) => item.id === "RW_7");

  it("the default mould treatment reads the mould rate: cleared, the scope is blocked on that field", () => {
    const doc = scope(MOULD_JOB, "mouldRemediationTreatmentRate");
    const line = chemicalLine(doc);
    expect(line.pricingStatus).toBe("rate_not_set");
    expect(line.rateField).toBe("mouldRemediationTreatmentRate");
    expect(line.rate).toBeNull();
    expect(line.subtotal).toBeNull();
    expect(doc.blockedPricing?.status).toBe("blocked");
  });

  it("control: the default mould treatment is priced at the mould rate, and does not need the antimicrobial rate", () => {
    const doc = scope(MOULD_JOB, "antimicrobialTreatmentRate");
    const line = chemicalLine(doc);
    expect(line.pricingStatus).toBeUndefined();
    expect(line.rate).toBe(FULL.mouldRemediationTreatmentRate);
    expect(line.subtotal).toBe(line.qty * FULL.mouldRemediationTreatmentRate);
    expect(doc.blockedPricing ?? null).toBeNull();
  });

  // Review rounds 7 and 8: the scope of works reads its treatment text
  // whatever its capitals. Which treatment a job is charged for, and whether
  // the cost estimate should follow the same rule, is RA-8309 (a pricing
  // decision); B2 leaves both documents' rules as they are on main.
  const selected = (treatment: string, hazards = ["None identified"]) =>
    ({
      tier1: { T1_Q7_hazards: hazards, T1_Q6_materialsAffected: [] },
      tier3: {
        T3_Q3_chemicalTreatment: treatment,
        T3_Q4_totalAffectedArea: "45 sqm",
      },
    }) as unknown as (typeof JOBS)[number];
  const costChemicals = (doc: any) =>
    (Object.values(doc.categories) as any[])
      .flatMap((c) => c.lineItems)
      .filter((item: any) => "ratePerSqm" in item);

  it.each([
    ["biohazard treatment", "biohazardTreatmentRate"],
    ["Biohazard treatment (if contaminated water — Category 3)", "biohazardTreatmentRate"],
    ["BIO-HAZARD TREATMENT", "biohazardTreatmentRate"],
    ["Enhanced mould remediation (if active growth suspected)", "mouldRemediationTreatmentRate"],
    ["MOULD TREATMENT", "mouldRemediationTreatmentRate"],
    ["Standard antimicrobial treatment (preventative — all Category 1 losses)", "antimicrobialTreatmentRate"],
  ])("scope of works: selected treatment %j reads %s", (treatment, field) => {
    const job = selected(treatment);
    // Cleared: the scope is blocked on exactly that field.
    const blockedLine = chemicalLine(scope(job, field));
    expect(blockedLine.pricingStatus).toBe("rate_not_set");
    expect(blockedLine.rateField).toBe(field);
    expect(blockedLine.subtotal).toBeNull();
    // Control, every rate set: it is priced from that same field.
    const rate = (FULL as Record<string, number>)[field];
    const priced = chemicalLine(scope(job, null));
    expect(priced.rate).toBe(rate);
    expect(priced.subtotal).toBe(priced.qty * rate);
  });

  // CodeRabbit on 4ff5b93fe: the notice shows a line's description beside
  // "Rate not set", so a blocked scope must name the treatment whose rate it
  // reads. The priced document keeps main's wording for that line.
  it.each([
    ["Enhanced mould remediation (if active growth suspected)", ["None identified"], "mouldRemediationTreatmentRate", "RW_7: Mould remediation treatment"],
    ["biohazard treatment", ["None identified"], "biohazardTreatmentRate", "RW_7: Biohazard treatment"],
    ["Standard antimicrobial treatment", ["Biohazard contamination"], "biohazardTreatmentRate", "RW_7: Biohazard treatment"],
    ["Standard antimicrobial treatment", ["None identified"], "antimicrobialTreatmentRate", "RW_7: Antimicrobial treatment"],
  ])("scope of works: a blocked result names the treatment priced (%j, hazards %j)", (treatment, hazards, field, description) => {
    const job = selected(treatment, hazards);
    const blockedLines = scope(job, field).blockedPricing.lines.filter(
      (l: any) => l.rateField === field && l.pricingStatus === "rate_not_set",
    );
    expect(blockedLines.map((l: any) => l.description)).toEqual([description]);
    // Control, every rate set: the document's own line is worded as on main.
    expect(chemicalLine(scope(job, null)).description).toBe(
      "Antimicrobial Chemical Treatment",
    );
  });

  it("scope of works: the selected treatment still comes before the hazard ticked, as on main", () => {
    const job = selected("Mould treatment", ["Biohazard contamination"]);
    expect(chemicalLine(scope(job, null)).rate).toBe(
      FULL.mouldRemediationTreatmentRate,
    );
    // The biohazard rate is not read by this line, so clearing it blocks nothing here.
    expect(chemicalLine(scope(job, "biohazardTreatmentRate")).pricingStatus).toBeUndefined();
    expect(chemicalLine(scope(job, "mouldRemediationTreatmentRate")).rateField).toBe(
      "mouldRemediationTreatmentRate",
    );
  });

  it.each([
    ["no hazard ticked, any treatment selected", "biohazard treatment", ["None identified"], ["antimicrobialTreatmentRate"]],
    ["biohazard ticked, mould treatment selected", "Mould treatment", ["Biohazard contamination"], ["biohazardTreatmentRate"]],
    ["mould ticked", "Standard antimicrobial treatment", ["Active mould growth"], ["mouldRemediationTreatmentRate"]],
  ])("cost estimate: chemical lines follow the hazards ticked, unchanged by B2 (%s)", (_name, treatment, hazards, fields) => {
    const job = selected(treatment, hazards);
    // Every rate set: one line per field, priced from that field.
    const priced = costChemicals(cost(job, null));
    expect(priced.map((l: any) => l.ratePerSqm)).toEqual(
      fields.map((f) => (FULL as Record<string, number>)[f]),
    );
    // Each field the document reads, cleared, blocks its own line.
    for (const field of fields) {
      const lines = costChemicals(cost(job, field));
      const blockedLines = lines.filter((l: any) => l.pricingStatus);
      expect(blockedLines).toHaveLength(1);
      expect(blockedLines[0].rateField).toBe(field);
      expect(blockedLines[0].subtotal).toBeNull();
    }
  });

  const ZERO_UNITS = [
    { groupId: "lgr-85", quantity: 0 },
    { groupId: "airmover-800", quantity: 3 },
  ];
  const withEquipment = (cleared: string | null) => ({
    ...inputs(JOBS[0], cleared),
    equipmentSelection: ZERO_UNITS,
  });

  it("a zero-unit equipment line whose rate is not set is shown as the blocked line (cost estimate)", () => {
    const doc = buildCostEstimationData({
      ...withEquipment("dehumidifierLGRDailyRate"),
      scopeData: { lineItems: [] },
      gstTreatment: getGstTreatment("AU"),
    }) as any;
    const equipment = doc.categories.equipment;
    expect(equipment.total).toBeNull();
    const blockedRows = equipment.lineItems.filter(
      (item: any) => item.pricingStatus === "rate_not_set",
    );
    expect(blockedRows).toHaveLength(1);
    expect(blockedRows[0].rateField).toBe("dehumidifierLGRDailyRate");
    expect(blockedRows[0].subtotal).toBeNull();
  });

  it("a zero-unit equipment line whose rate is not set is shown as the blocked line (scope of works)", () => {
    const doc = buildScopeOfWorksData(
      withEquipment("dehumidifierLGRDailyRate") as never,
    ) as any;
    const setup = doc.lineItems.find((item: any) => item.id === "RW_3");
    expect(setup.subtotal).toBeNull();
    const rows = Object.values(setup.equipment).flatMap((g: any) => g.items);
    const blockedRows = rows.filter(
      (row: any) => row.pricingStatus === "rate_not_set",
    );
    expect(blockedRows).toHaveLength(1);
    expect(blockedRows[0].rateField).toBe("dehumidifierLGRDailyRate");
    expect(blockedRows[0].total).toBeNull();
  });

  it("control: a zero-unit line with its rate set adds no row and blocks nothing", () => {
    const costDoc = buildCostEstimationData({
      ...withEquipment(null),
      scopeData: { lineItems: [] },
      gstTreatment: getGstTreatment("AU"),
    }) as any;
    expect(costDoc.categories.equipment.lineItems).toHaveLength(1);
    expect(isNumber(costDoc.categories.equipment.total)).toBe(true);
    const scopeDoc = buildScopeOfWorksData(withEquipment(null) as never) as any;
    const setup = scopeDoc.lineItems.find((item: any) => item.id === "RW_3");
    const rows = Object.values(setup.equipment).flatMap((g: any) => g.items);
    expect(rows).toHaveLength(1);
    expect(isNumber(setup.subtotal)).toBe(true);
  });

  // Review round 6: two independent causes on the equipment of one document.
  const TWO_CAUSES = [
    { groupId: "lgr-85", quantity: 1 },
    { groupId: "", quantity: 1 },
    { groupId: "airmover-800", quantity: 3 },
  ];
  const twoCauses = () => ({
    ...inputs(JOBS[0], "dehumidifierLGRDailyRate"),
    equipmentSelection: TWO_CAUSES,
  });
  const nameOf = (groupId: string) => getEquipmentGroupById(groupId)!.name;
  const expectBothCauses = (lines: any[]) => {
    const notSet = lines.filter(
      (l) =>
        l.pricingStatus === "rate_not_set" &&
        l.rateField === "dehumidifierLGRDailyRate" &&
        l.description.includes(nameOf("lgr-85")),
    );
    expect(notSet.length, "the LGR line itself is listed blocked").toBeGreaterThan(0);
    const unusable = lines.filter((l) => l.pricingStatus === "unusable_line");
    expect(unusable.length, "the unreadable saved line is listed").toBeGreaterThan(0);
    for (const l of [...notSet, ...unusable]) {
      expect(l.subtotal).toBeNull();
      expect(l.rate).toBeNull();
    }
    const priced = lines.filter(
      (l) =>
        l.pricingStatus === "priced" &&
        l.description.includes(nameOf("airmover-800")),
    );
    expect(priced.length, "the priced air mover line is listed with its amount").toBeGreaterThan(0);
    expect(isNumber(priced[0].subtotal)).toBe(true);
  };

  it("an unset equipment rate and an unreadable saved line on one scope are both listed in the blocked result", () => {
    const doc = buildScopeOfWorksData(twoCauses() as never) as any;
    expectBothCauses(doc.blockedPricing.lines);
  });

  it("an unset equipment rate and an unreadable saved line on one cost estimate are both listed in the blocked result", () => {
    const doc = buildCostEstimationData({
      ...twoCauses(),
      scopeData: { lineItems: [] },
      gstTreatment: getGstTreatment("AU"),
    }) as any;
    expectBothCauses(doc.blockedPricing.lines);
  });

  it("a blocked scope still shows the set rate of the daily monitoring line", () => {
    const doc = scope(JOBS[0], "administrationFee");
    const line = doc.blockedPricing.lines.find((l: any) =>
      l.description.startsWith("RW_5:"),
    );
    expect(line.pricingStatus).toBe("priced");
    expect(line.rate).toBe(FULL.qualifiedTechnicianNormalHours);
    expect(isNumber(line.subtotal)).toBe(true);
  });

  it("control: the daily monitoring line shows no rate when its own rate is not set", () => {
    const doc = scope(JOBS[0], "qualifiedTechnicianNormalHours");
    const line = doc.blockedPricing.lines.find((l: any) =>
      l.description.startsWith("RW_5:"),
    );
    expect(line.pricingStatus).toBe("rate_not_set");
    expect(line.rate).toBeNull();
    expect(line.subtotal).toBeNull();
  });
});
