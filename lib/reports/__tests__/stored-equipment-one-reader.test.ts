/**
 * RA-8281 B1 round 13: every consumer of a stored equipment selection goes
 * through lib/reports/stored-equipment-pricing.ts. These tests feed the
 * consumers the values that broke earlier rounds (a null entry, text that is
 * not JSON, a rate cleared since the save) and check each one answers with a
 * named, blocked result. Never a crash, never $0, never the cached figure.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getGstTreatment } from "@/lib/gst-rules";
import { RateNotSetError } from "@/lib/pricing/rate-not-set";
import { buildCostEstimationData } from "@/lib/restoration/cost-estimation-builder";
import { buildScopeOfWorksData } from "@/lib/restoration/scope-of-works-builder";
import { buildInspectionReportPrompt } from "@/lib/reports/generate-report-ai";
import { generateIICRCReportPDF } from "@/lib/generate-iicrc-report-pdf";
import {
  assertEquipmentPriced,
  editableStoredEquipment,
  equipmentAmps,
  equipmentUnitCount,
  hasStoredEquipment,
  moneyOrRateNotSet,
  withoutCachedEquipmentMoney,
  MALFORMED_LINE_NOTE,
  priceStoredEquipment,
  readEquipmentDeploymentLog,
  readStoredEquipment,
  storedEquipmentResponse,
  UNUSABLE_LINE_LABEL,
} from "@/lib/reports/stored-equipment-pricing";

const LGR = { dehumidifierLGRDailyRate: 70 };
const STALE = [{ groupId: "lgr-85", quantity: 2, dailyRate: 61 }];

describe("the one reader: the stored column, parsed or not", () => {
  it("reads the database column (a JSON string) the same as its parsed value", () => {
    const fromText = priceStoredEquipment(JSON.stringify(STALE), LGR, 4);
    const fromValue = priceStoredEquipment(STALE, LGR, 4);
    expect(fromText).toEqual(fromValue);
    expect(fromText.total).toBe(70 * 2 * 4);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["blank text", "   "],
    ['the text "null"', "null"],
    ['the text "[]"', "[]"],
    ["an empty list", []],
  ])("%s is no equipment", (_label, value) => {
    expect(hasStoredEquipment(value)).toBe(false);
    expect(readStoredEquipment(value)).toEqual([]);
  });

  it.each([
    ["text that is not JSON", "{not json"],
    ["a null entry", [null]],
    ['the text "[null]"', "[null]"],
    ["a number", 7],
    ["a nested list entry", [[{ groupId: "lgr-85", quantity: 1 }]]],
    ["a line with no quantity", [{ groupId: "lgr-85" }]],
  ])("%s is one line that is not usable: kept, quantity 0, blocked", (_label, value) => {
    expect(hasStoredEquipment(value)).toBe(true);
    const lines = readStoredEquipment(value);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ usable: false, quantity: 0 });
    const priced = priceStoredEquipment(value, LGR, 4);
    expect(priced.lines[0]).toMatchObject({
      usable: false,
      dailyRate: null,
      total: null,
      note: MALFORMED_LINE_NOTE,
    });
    expect(priced.total).toBeNull();
  });

  it("a readable line is usable and carries its name and unit count, no money", () => {
    expect(readStoredEquipment(STALE)).toEqual([
      {
        groupId: "lgr-85",
        name: expect.any(String),
        quantity: 2,
        usable: true,
      },
    ]);
    expect(Object.keys(readStoredEquipment(STALE)[0])).not.toContain("dailyRate");
  });

  it("unit count and power draw skip a line that is not usable", () => {
    const lines = readStoredEquipment([null, ...STALE]);
    expect(equipmentUnitCount(lines)).toBe(2);
    expect(equipmentAmps(lines)).toBe(equipmentAmps(readStoredEquipment(STALE)));
    expect(equipmentAmps(lines)).toBeGreaterThan(0);
  });

  it("an editor loads the readable lines only, with no rate, and is told how many were left out", () => {
    expect(editableStoredEquipment(JSON.stringify([null, ...STALE, "x"]))).toEqual({
      selections: [{ groupId: "lgr-85", quantity: 2 }],
      unusableCount: 2,
      hasLines: true,
    });
    expect(editableStoredEquipment(null)).toEqual({
      selections: [],
      unusableCount: 0,
      hasLines: false,
    });
  });

  it("assertEquipmentPriced names an unset rate and an unusable line; passes when priced", () => {
    expect(() =>
      assertEquipmentPriced(priceStoredEquipment(STALE, { dehumidifierLGRDailyRate: null }, 4)),
    ).toThrow(RateNotSetError);
    expect(() =>
      assertEquipmentPriced(priceStoredEquipment([null], LGR, 4)),
    ).toThrow(/cannot be priced/);
    expect(() =>
      assertEquipmentPriced(priceStoredEquipment(STALE, LGR, 4)),
    ).not.toThrow();
    expect(() => assertEquipmentPriced(priceStoredEquipment(null, LGR, 4))).not.toThrow();
  });
});

describe("storedEquipmentResponse: what a GET returns in place of the stored column", () => {
  it("a cleared rate: null rate with its note, null total, and neither cached figure", () => {
    const res = storedEquipmentResponse(
      JSON.stringify(STALE),
      { dehumidifierLGRDailyRate: null },
      4,
    );
    expect(res.equipmentSelection?.[0].dailyRate).toBeNull();
    expect(res.equipmentSelection?.[0].note).toMatch(/Rate not set/);
    expect(res.equipmentCostTotal).toBeNull();
    expect(JSON.stringify(res)).not.toContain("61");
  });

  it("control: a set rate gives the current price and total", () => {
    const res = storedEquipmentResponse(JSON.stringify(STALE), LGR, 4);
    expect(res.equipmentSelection?.[0].dailyRate).toBe(70);
    expect(res.equipmentCostTotal).toBe(560);
    expect(res.equipmentProblems).toEqual([]);
  });

  it("nothing stored is null; a stored empty list is [] with no total", () => {
    expect(storedEquipmentResponse(null, LGR, 4).equipmentSelection).toBeNull();
    const empty = storedEquipmentResponse("[]", LGR, 4);
    expect(empty.equipmentSelection).toEqual([]);
    expect(empty.equipmentCostTotal).toBeNull();
  });
});

describe("the deployment log (IICRC PDF and insurer portal): no money, never throws", () => {
  it("a null entry and a non-object entry are rows of blanks", () => {
    expect(readEquipmentDeploymentLog([null, "x", 3])).toEqual(
      Array(3).fill({
        type: null,
        brandModel: null,
        serial: null,
        location: null,
        date: null,
      }),
    );
  });

  it("reads a list, and an older object holding its list under equipment, items or selected", () => {
    const row = {
      type: "LGR dehumidifier",
      make: "Acme",
      model: "X1",
      serial: "S-1",
      room: "Kitchen",
      date: "2026-10-01",
    };
    const expected = [
      {
        type: "LGR dehumidifier",
        brandModel: "Acme X1",
        serial: "S-1",
        location: "Kitchen",
        date: "2026-10-01",
      },
    ];
    expect(readEquipmentDeploymentLog([row])).toEqual(expected);
    expect(readEquipmentDeploymentLog(JSON.stringify([row]))).toEqual(expected);
    for (const key of ["equipment", "items", "selected"]) {
      expect(readEquipmentDeploymentLog({ [key]: [row] })).toEqual(expected);
    }
  });

  it("nothing stored, text that is not JSON, and an object with no list are an empty log", () => {
    for (const value of [null, undefined, "", "{not json", { dehumidifiers: [{}] }, 5]) {
      expect(readEquipmentDeploymentLog(value)).toEqual([]);
    }
  });

  it("a stored selection never puts its cached rate in the log", () => {
    expect(JSON.stringify(readEquipmentDeploymentLog(STALE))).not.toContain("61");
  });

  it("the IICRC PDF renders with a stored null entry instead of throwing", async () => {
    const bytes = await generateIICRCReportPDF({
      id: "synthetic-report",
      equipmentSelection: "[null]",
      user: { businessName: "Synthetic Restoration" },
    } as Parameters<typeof generateIICRCReportPDF>[0]);
    expect(bytes.byteLength).toBeGreaterThan(1024);
  });
});

describe("the inspection prompt: every section reads the validated lines", () => {
  function prompt(equipmentSelection: unknown, pricingConfig: unknown = LGR) {
    return buildInspectionReportPrompt({
      report: { estimatedDryingDuration: 4 },
      analysis: null,
      stateInfo: null,
      reportType: "detailed",
      // The loadout schedule sits inside the psychrometric section.
      psychrometricAssessment: {
        waterClass: 2,
        temperature: 25,
        humidity: 60,
        systemType: "closed",
        dryingPotential: { dryingIndex: 40, status: "FAIR", recommendation: "Add air movement" },
      },
      equipmentSelection,
      pricingConfig,
    } as Parameters<typeof buildInspectionReportPrompt>[0]);
  }

  it.each([
    ["a null entry", [null]],
    ["the stored text [null]", "[null]"],
    ["text that is not JSON", "{not json"],
    ["a null entry beside a readable line", [null, ...STALE]],
  ])("%s: no throw, the line is named as not usable, no total is stated", (_label, value) => {
    const text = prompt(value);
    // The loadout schedule, the deployed list and the power-draw list each
    // name the line.
    expect(text).toContain(`- ${UNUSABLE_LINE_LABEL}. `);
    expect(text).toMatch(new RegExp(`Equipment Deployed: .*${UNUSABLE_LINE_LABEL.replace(/[()]/g, "\\$&")}`));
    expect(text).toMatch(new RegExp(`Equipment Load: .*${UNUSABLE_LINE_LABEL.replace(/[()]/g, "\\$&")}`));
    expect(text).toContain("Total Daily Equipment Cost: Rate not set");
    expect(text).not.toMatch(/Total Daily Equipment Cost: \$/);
  });

  it("unit count, deployed list and power draw come from the readable lines only", () => {
    const amps = equipmentAmps(readStoredEquipment(STALE));
    const text = prompt([null, ...STALE]);
    expect(text).toContain("2 Total Units");
    expect(text).toMatch(/Equipment Deployed: .*2x /);
    expect(text).toContain(`Power Draw Calculation: ${amps.toFixed(1)} Amps total`);
  });

  it("control: readable lines list no unusable line and state the current total", () => {
    const text = prompt(STALE);
    expect(text).not.toContain(UNUSABLE_LINE_LABEL);
    expect(text).toContain("Total Daily Equipment Cost: $140.00");
    expect(text).not.toContain("$61.00");
  });

  it("the basic (visual) prompt also reads the validated lines", () => {
    const text = buildInspectionReportPrompt({
      report: { estimatedDryingDuration: 4 },
      analysis: null,
      stateInfo: null,
      reportType: "basic",
      scopeAreas: [{ name: "Kitchen" }],
      equipmentSelection: [null, ...STALE],
      pricingConfig: LGR,
    } as Parameters<typeof buildInspectionReportPrompt>[0]);
    expect(text).toContain(`- ${UNUSABLE_LINE_LABEL}`);
    expect(text).toContain("**2 Drying Units Deployed**");
    expect(text).toContain("LGR Dehumidifier");
  });
});

describe("the priced documents (cost estimation, scope of works)", () => {
  const PRICING = new Proxy(
    {},
    { get: (_t, key) => (key === "dehumidifierLGRDailyRate" ? 70 : 50) },
  ) as Record<string, number>;
  const CLEARED = new Proxy(
    {},
    { get: (_t, key) => (key === "dehumidifierLGRDailyRate" ? null : 50) },
  ) as Record<string, number>;
  const report = {
    id: "rep_1",
    reportNumber: "RA-1",
    claimReferenceNumber: "CLM-1",
    waterCategory: "2",
    biologicalMouldDetected: false,
    biologicalMouldCategory: null,
    hazardType: "water damage",
    technicianFieldReport: "Burst flexi hose under the vanity.",
    estimatedDryingDuration: 4,
    inspection: null,
  };
  const common = {
    report,
    analysis: null,
    tier1: { T1_Q7_hazards: ["None identified"] },
    tier2: null,
    tier3: null,
    stateInfo: null,
    scopeAreas: [{ length: 8, width: 5, wetPercentage: 100 }],
  };
  const cost = (equipmentSelection: unknown, pricingConfig: unknown = PRICING) =>
    buildCostEstimationData({
      ...common,
      pricingConfig,
      scopeData: { lineItems: [] },
      equipmentSelection,
      gstTreatment: getGstTreatment("AU"),
    }) as any;
  const scope = (equipmentSelection: unknown, pricingConfig: unknown = PRICING) =>
    buildScopeOfWorksData({
      ...common,
      pricingConfig,
      equipmentSelection,
    } as Parameters<typeof buildScopeOfWorksData>[0]) as any;

  describe.each([
    ["cost estimation", cost],
    ["scope of works", scope],
  ])("%s", (_name, build) => {
    it.each([
      ["a null entry", [null]],
      ["the stored text [null]", "[null]"],
      ["text that is not JSON", "{not json"],
      ["a line with no equipment type", [{ quantity: 2, dailyRate: 61 }]],
    ])("%s refuses the document by name (RateNotSetError), not a TypeError", (_label, value) => {
      expect(() => build(value)).toThrow(RateNotSetError);
      expect(() => build(value)).toThrow(/cannot be priced/);
    });

    it("a stale cached 61 with the rate cleared refuses the document; the cached rate is not used", () => {
      expect(() => build(STALE, CLEARED)).toThrow(RateNotSetError);
      expect(() => build(STALE, CLEARED)).toThrow(/Rate not set/);
    });

    it("control: no equipment at all still builds", () => {
      expect(() => build(null)).not.toThrow();
      expect(() => build("[]")).not.toThrow();
    });
  });

  it("control: cost estimation prices the stored line at the current 70, from the column text too", () => {
    for (const value of [STALE, JSON.stringify(STALE)]) {
      const item = cost(value).categories.equipment.lineItems[0];
      expect(item).toMatchObject({ qty: 2, days: 4, dailyRate: 70, subtotal: 560 });
      expect(cost(value).categories.equipment.total).toBe(560);
    }
  });

  it("control: scope of works prices the stored line at the current 70", () => {
    const rw3 = scope(STALE).lineItems.find((i: { id: string }) => i.id === "RW_3");
    expect(rw3.equipment.lgr).toMatchObject({ qty: 2, days: 4, rate: 70 });
    expect(rw3.subtotal).toBe(4 * 50 + 6 * 50 + 560);
  });

  it("the air-mover safety gate counts stored air movers from the validated lines", () => {
    const movers = [{ groupId: "airmover-1500", quantity: 6, dailyRate: 25 }];
    expect(cost(movers).safety.airMoverQty).toBe(6);
    expect(scope(movers).safety.airMoverQty).toBe(6);
  });
});

// Review round 13 (second finding): a finite quantity whose product overflows
// priced a line at Infinity, which is not null, so the "total is blocked"
// refusal let it through and JSON showed null with no reason. Every figure the
// reader returns is an exact, non-negative amount or it is blocked with a note.
describe("the one reader: a figure that is not an exact amount is blocked, with a reason", () => {
  const TOO_LARGE = /too large to price/;

  it.each([
    ["a quantity whose line total overflows", [{ groupId: "lgr-85", quantity: 1e308 }], 4],
    ["a quantity beyond exact whole numbers", [{ groupId: "lgr-85", quantity: 2 ** 60 }], 1],
    ["a line total beyond exact arithmetic", [{ groupId: "lgr-85", quantity: 1e14 }], 4],
    ["a duration that overflows", [{ groupId: "lgr-85", quantity: 1 }], Infinity],
    ["a duration that is not a number", [{ groupId: "lgr-85", quantity: 1 }], NaN],
    ["a negative duration", [{ groupId: "lgr-85", quantity: 1 }], -4],
  ])("%s: no figure, a named problem, and priced documents refuse", (_label, stored, days) => {
    const priced = priceStoredEquipment(stored, LGR, days as number);
    expect(priced.total).toBeNull();
    expect(priced.dailyTotal).toBeNull();
    expect(priced.lines[0].total).toBeNull();
    expect(priced.lines[0].dailyTotal).toBeNull();
    expect(priced.lines[0].dailyRate).toBeNull();
    expect(priced.problems.join(" ")).toMatch(TOO_LARGE);
    expect(() => assertEquipmentPriced(priced)).toThrow(RateNotSetError);
    const text = JSON.stringify(priced);
    expect(text).not.toContain("Infinity");
    for (const line of priced.lines) {
      for (const figure of [line.dailyRate, line.dailyTotal, line.total]) {
        expect(figure === null || Number.isSafeInteger(Math.round(figure))).toBe(true);
      }
    }
  });

  it("lines that are each exact but whose sum is not: the total is blocked with the reason", () => {
    const priced = priceStoredEquipment(
      [
        { groupId: "lgr-85", quantity: 5e11 },
        { groupId: "lgr-85", quantity: 5e11 },
        { groupId: "lgr-85", quantity: 5e11 },
      ],
      LGR,
      1,
    );
    expect(priced.lines.every((l) => l.total === 70 * 5e11)).toBe(true);
    expect(priced.total).toBeNull();
    expect(priced.dailyTotal).toBeNull();
    expect(priced.problems.join(" ")).toMatch(TOO_LARGE);
    expect(() => assertEquipmentPriced(priced)).toThrow(RateNotSetError);
  });

  it.each([
    // 2 lines x 5e11 x $70: $7e13 a day is exact; over 2 days the sum is not.
    ["only the job total", 2, 2],
    // 3 lines x 5e11 x $70: the daily sum is not exact; over half a day the job total is.
    ["only the daily total", 3, 0.5],
  ])("when %s sums past an exact amount, both totals are blocked with the reason", (_label, count, days) => {
    const priced = priceStoredEquipment(
      Array.from({ length: count }, () => ({ groupId: "lgr-85", quantity: 5e11 })),
      LGR,
      days,
    );
    expect(priced.lines.every((l) => l.total !== null && l.dailyTotal !== null)).toBe(true);
    expect(priced.total).toBeNull();
    expect(priced.dailyTotal).toBeNull();
    expect(priced.problems.join(" ")).toMatch(TOO_LARGE);
  });

  it("the response for an overflowing stored line carries the reason, never a bare null", () => {
    const res = storedEquipmentResponse(JSON.stringify([{ groupId: "lgr-85", quantity: 1e308 }]), LGR, 4);
    expect(res.equipmentCostTotal).toBeNull();
    expect(res.equipmentSelection?.[0]).toMatchObject({ dailyRate: null });
    expect(res.equipmentSelection?.[0].note).toMatch(TOO_LARGE);
    expect(res.equipmentProblems.join(" ")).toMatch(TOO_LARGE);
  });

  it("control: a large but exact job still prices", () => {
    const priced = priceStoredEquipment([{ groupId: "lgr-85", quantity: 5000 }], LGR, 365);
    expect(priced.total).toBe(70 * 5000 * 365);
    expect(priced.problems).toEqual([]);
  });

  it("a negative quantity is a line that is not usable for every reader, named as malformed", () => {
    const stored = [{ groupId: "lgr-85", quantity: -2 }, { groupId: "lgr-85", quantity: 3 }];
    const lines = readStoredEquipment(stored);
    expect(lines[0].usable).toBe(false);
    expect(equipmentUnitCount(lines)).toBe(3);
    const priced = priceStoredEquipment(stored, LGR, 4);
    expect(priced.lines[0].note).toBe(MALFORMED_LINE_NOTE);
    expect(priced.total).toBeNull();
  });

  it("non-money readers never see an overflowing quantity either", () => {
    const lines = readStoredEquipment([{ groupId: "lgr-85", quantity: 1e308 }, { groupId: "lgr-85", quantity: 2 }]);
    expect(lines[0].usable).toBe(false);
    expect(equipmentUnitCount(lines)).toBe(2);
    expect(Number.isFinite(equipmentAmps(lines))).toBe(true);
  });
});

// Review round 13 (third review, finding 1): quantity 0.5 at $70.01 returned
// 35.005 and was saved, while the same figure displayed as $35.01. Every amount
// the reader returns is a whole number of cents, so what is stored, summed and
// shown are the same number. Equipment is counted in whole units.
describe("the one reader: every amount is a whole number of cents", () => {
  const wholeCents = (v: number | null) =>
    v !== null && Math.abs(v * 100 - Math.round(v * 100)) < 1e-9;

  it("a fractional quantity is a line that is not usable (equipment is counted in whole units)", () => {
    const priced = priceStoredEquipment([{ groupId: "lgr-85", quantity: 0.5 }], { dehumidifierLGRDailyRate: 70.01 }, 1);
    expect(priced.lines[0]).toMatchObject({ usable: false, dailyRate: null, total: null, note: MALFORMED_LINE_NOTE });
    expect(priced.total).toBeNull();
    expect(() => assertEquipmentPriced(priced)).toThrow(RateNotSetError);
    expect(readStoredEquipment([{ groupId: "lgr-85", quantity: 0.5 }])[0].usable).toBe(false);
  });

  it.each([
    ["half a day at $70.01", 70.01, 1, 0.5, 35.01],
    ["a rate with a part cent", 70.015, 1, 1, 70.02],
    ["a rate with a part cent over three units", 33.335, 3, 1, 100.01],
    ["control: whole cents are unchanged", 70.01, 3, 4, 840.12],
    ["control: whole dollars are unchanged", 70, 2, 4, 560],
  ])("%s: the line and the total are the same whole-cent figure that is displayed", (_label, rate, quantity, days, expected) => {
    const priced = priceStoredEquipment([{ groupId: "lgr-85", quantity }], { dehumidifierLGRDailyRate: rate }, days);
    expect(priced.lines[0].total).toBe(expected);
    expect(priced.total).toBe(expected);
    expect(priced.lines[0].dailyRate).toBe(rate); // the contractor's own rate is never altered
    expect(wholeCents(priced.lines[0].dailyTotal)).toBe(true);
    expect(wholeCents(priced.dailyTotal)).toBe(true);
    expect(moneyOrRateNotSet(priced.total)).toBe(`$${expected.toFixed(2)}`);
  });

  it("the total is the sum of the line figures as shown, not of the unrounded products", () => {
    // 33.335 x 1 x 1 shows $33.34 on each of two lines; the total is $66.68, not $66.67.
    const priced = priceStoredEquipment(
      [{ groupId: "lgr-85", quantity: 1 }, { groupId: "lgr-85", quantity: 1 }],
      { dehumidifierLGRDailyRate: 33.335 },
      1,
    );
    expect(priced.lines.map((l) => l.total)).toEqual([33.34, 33.34]);
    expect(priced.total).toBe(66.68);
    expect(priced.dailyTotal).toBe(66.68);
  });
});

// Review round 13 (third review, finding 2): storedEquipmentResponse parsed the
// column and then handed the PARSED value to priceStoredEquipment, which parsed
// it again. A column holding the JSON string "null" became the string "null"
// and then null: an unusable stored entry vanished with no problem named. The
// stored text is parsed exactly once, by one function.
describe("the one reader: the stored text is parsed exactly once", () => {
  const ONCE_ENCODED = JSON.stringify([{ groupId: "lgr-85", quantity: 2, dailyRate: 61 }]);
  const NASTY: Array<[string, unknown, number]> = [
    ["the JSON string \"null\"", JSON.stringify("null"), 1],
    ["the JSON string \"[]\"", JSON.stringify("[]"), 1],
    ["a twice-encoded list", JSON.stringify(ONCE_ENCODED), 1],
    ["the JSON string \"\"", JSON.stringify(""), 1],
    ["a parsed value that is the string \"null\"... as column text", "\"null\"", 1],
    ["control: the column text null", "null", 0],
    ["control: the column text []", "[]", 0],
    ["control: a once-encoded list", ONCE_ENCODED, 1],
    ["control: nothing stored", null, 0],
  ];

  it.each(NASTY)("%s: every reader sees the same number of lines", (_label, stored, count) => {
    const priced = priceStoredEquipment(stored, LGR, 4);
    const response = storedEquipmentResponse(stored, LGR, 4);
    expect(readStoredEquipment(stored)).toHaveLength(count);
    expect(priced.lines).toHaveLength(count);
    expect(response.equipmentSelection ?? []).toHaveLength(count);
    expect(hasStoredEquipment(stored)).toBe(count > 0);
    expect(editableStoredEquipment(stored).hasLines).toBe(count > 0);
    // The response says exactly what the pricing says.
    expect(response.equipmentProblems).toEqual(priced.problems);
    expect(response.equipmentCostTotal).toBe(count > 0 ? priced.total : null);
  });

  it.each(NASTY.slice(0, 5))("%s: one line that is not usable, with the problem named", (_label, stored) => {
    const response = storedEquipmentResponse(stored, LGR, 4);
    expect(response.equipmentSelection).toHaveLength(1);
    expect(response.equipmentSelection?.[0]).toMatchObject({ usable: false, dailyRate: null });
    expect(response.equipmentProblems).toEqual([MALFORMED_LINE_NOTE]);
    expect(response.equipmentCostTotal).toBeNull();
    expect(withoutCachedEquipmentMoney({ equipmentSelection: stored }).equipmentSelection).toEqual([]);
  });

  it("only one function in the reader parses stored text", () => {
    const src = readFileSync(join(__dirname, "..", "stored-equipment-pricing.ts"), "utf8");
    expect(src.match(/JSON\.parse\(/g)).toHaveLength(1);
    // Its definition plus its two callers (the line reader and the deployment
    // log), each on a public function's own argument.
    expect(src.match(/\bparseStored\(/g)).toHaveLength(3);
    // Everything that prices goes through the one line reader.
    expect(src.match(/\bstoredRawLines\(/g)).toHaveLength(3);
  });
});
