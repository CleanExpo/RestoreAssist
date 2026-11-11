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
import { billableDailyRate, selectionDailyRate } from "@/lib/equipment-matrix";
import { RateNotSetError } from "@/lib/pricing/rate-not-set";
import { buildCostEstimationData } from "@/lib/restoration/cost-estimation-builder";
import { buildScopeOfWorksData } from "@/lib/restoration/scope-of-works-builder";
import { buildInspectionReportPrompt } from "@/lib/reports/generate-report-ai";
import { generateIICRCReportPDF } from "@/lib/generate-iicrc-report-pdf";
import {
  assertEquipmentPriced,
  editableStoredEquipment,
  equipmentLineAmount,
  equipmentAmps,
  equipmentUnitCount,
  hasStoredEquipment,
  moneyOrRateNotSet,
  withoutCachedEquipmentMoney,
  MALFORMED_LINE_NOTE,
  priceStoredEquipment,
  readEquipmentDeploymentLog,
  readStoredEquipment,
  scopeEquipmentRows,
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
    ['the text "null"', "null"],
    ['the text "[]"', "[]"],
    ["an empty list", []],
  ])("%s is no equipment", (_label, value) => {
    expect(hasStoredEquipment(value)).toBe(false);
    expect(readStoredEquipment(value)).toEqual([]);
  });

  it.each([
    ["text that is not JSON", "{not json"],
    // Review 9: blank text is not "nothing sent". Only null and undefined are.
    ["empty text", ""],
    ["text of spaces", "   "],
    ["text of a tab and a new line", "\t\n"],
    ['the text of a blank JSON string', '"  "'],
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

  // CodeRabbit on #2533: a line saved by the equipment screens carries only
  // its groupId, so the PDF and the insurer portal showed a blank type.
  it("a saved line with only a groupId is named by its catalogue group", () => {
    const log = readEquipmentDeploymentLog([
      { groupId: "lgr-85", quantity: 2, dailyRate: 61 },
      { groupId: "not-in-catalogue", quantity: 1 },
      { groupId: "   ", quantity: 1 },
      { groupId: "lgr-85", type: "Named by the technician" },
    ]);
    expect(log.map((row) => row.type)).toEqual([
      readStoredEquipment([{ groupId: "lgr-85", quantity: 1 }])[0].name,
      "not-in-catalogue",
      null,
      "Named by the technician",
    ]);
    expect(log[0].type).not.toBe("lgr-85");
    expect(JSON.stringify(log)).not.toContain("61");
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
    ])(
      // RA-8281 (B2): the document is no longer refused by a throw. The line
      // is shown, blocked, and the total is blocked with it.
      "%s is shown as a blocked line with no amount, and the total is blocked, not a TypeError",
      (_label, value) => {
        const blocked = build(value).blockedPricing;
        expect(blocked).toMatchObject({ status: "blocked", total: null });
        const unusable = blocked.lines.filter(
          (l: { pricingStatus: string }) => l.pricingStatus === "unusable_line",
        );
        expect(unusable).toHaveLength(1);
        expect(unusable[0]).toMatchObject({ rate: null, subtotal: null });
        expect(unusable[0].pricingNote).toMatch(/cannot be priced/);
        expect(blocked.missing.map((m: { note: string }) => m.note).join(" ")).toMatch(
          /cannot be priced/,
        );
      },
    );

    it("a stale cached 61 with the rate cleared is a blocked line; the cached rate is not used", () => {
      const blocked = build(STALE, CLEARED).blockedPricing;
      expect(blocked).toMatchObject({ status: "blocked", total: null });
      const lines = blocked.lines.filter(
        (l: { rateField?: string }) => l.rateField === "dehumidifierLGRDailyRate",
      );
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line).toMatchObject({ pricingStatus: "rate_not_set", rate: null, subtotal: null });
        expect(line.pricingNote).toMatch(/Rate not set/);
      }
      expect(blocked.missing.map((m: { field: string }) => m.field)).toContain(
        "dehumidifierLGRDailyRate",
      );
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
    expect(rw3.equipment.lgr).toMatchObject({ qty: 2, days: 4 });
    expect(rw3.equipment.lgr.items[0]).toMatchObject({ dailyRate: 70, total: 560 });
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
    // 1.005 * 100 is 100.49999999999999 in floating point; half up is still $1.01.
    ["a part cent that binary arithmetic lands just under the half", 1.005, 1, 1, 1.01],
    ["a rate with a part cent over three units", 33.335, 3, 1, 100.02],
    ["control: whole cents are unchanged", 70.01, 3, 4, 840.12],
    ["control: whole dollars are unchanged", 70, 2, 4, 560],
  ])("%s: the line and the total are the same whole-cent figure that is displayed", (_label, rate, quantity, days, expected) => {
    const priced = priceStoredEquipment([{ groupId: "lgr-85", quantity }], { dehumidifierLGRDailyRate: rate }, days);
    expect(priced.lines[0].total).toBe(expected);
    expect(priced.total).toBe(expected);
    // The rate a line carries is the billable rate: the price-list rate to the cent.
    expect(priced.lines[0].dailyRate).toBe(billableDailyRate(rate));
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

// Review round 13 (fourth review): with a price-list rate of 33.335, one unit
// for two days showed $33.34 a day and $66.67 for the job; and a rate of 1.005
// showed $1.00 a day beside a daily amount of $1.01. Third finding on the same
// root cause (a figure that is not an exact amount), so the rule now starts at
// the source: the BILLABLE daily rate is the price-list rate to the whole cent
// (half up), set once where the rate is read. Every amount is that rate times
// whole units, times days, so the rate, the daily amount and the job total
// reconcile wherever they are shown.
describe("the billable rate: rate, daily amount and job total reconcile to the cent", () => {
  const cents = (v: number | null) => Math.round((v as number) * 100);

  it.each([
    [33.335, 33.34],
    [1.005, 1.01],
    [70.015, 70.02],
    [63.636363, 63.64],
    [70.014, 70.01],
    [70, 70],
    [70.01, 70.01],
    [0, 0],
  ])("a price-list rate of %s is billed at %s", (rate, billable) => {
    expect(billableDailyRate(rate)).toBe(billable);
    expect(selectionDailyRate({ groupId: "lgr-85" }, { dehumidifierLGRDailyRate: rate })).toBe(billable);
  });

  it("the reviewer's case: 33.335 for one unit over two days is $33.34 a day and $66.68", () => {
    const priced = priceStoredEquipment([{ groupId: "lgr-85", quantity: 1 }], { dehumidifierLGRDailyRate: 33.335 }, 2);
    expect(priced.lines[0]).toMatchObject({ dailyRate: 33.34, dailyTotal: 33.34, total: 66.68 });
    expect(priced.dailyTotal).toBe(33.34);
    expect(priced.total).toBe(66.68);
    expect(moneyOrRateNotSet(priced.lines[0].dailyRate)).toBe("$33.34");
  });

  it("the reviewer's second case: 1.005 shows $1.01 a day as the rate and as the daily amount", () => {
    const priced = priceStoredEquipment([{ groupId: "lgr-85", quantity: 1 }], { dehumidifierLGRDailyRate: 1.005 }, 1);
    expect(moneyOrRateNotSet(priced.lines[0].dailyRate)).toBe("$1.01");
    expect(moneyOrRateNotSet(priced.lines[0].dailyTotal)).toBe("$1.01");
  });

  it("for every rate, quantity and whole number of days: shown rate x units = daily amount, x days = job total, and totals are the sums", () => {
    const rates = [33.335, 1.005, 70.015, 63.636363, 0.105, 70, 70.01, 99.995, 12.345];
    const quantities = [1, 2, 3, 7, 40];
    const days = [1, 2, 3, 4, 30];
    for (const rate of rates) {
      for (const d of days) {
        const priced = priceStoredEquipment(
          quantities.map((quantity) => ({ groupId: "lgr-85", quantity })),
          { dehumidifierLGRDailyRate: rate },
          d,
        );
        for (const line of priced.lines) {
          const shownRate = Number(moneyOrRateNotSet(line.dailyRate).slice(1));
          expect(cents(line.dailyTotal), `${rate} x ${line.quantity}`).toBe(cents(shownRate) * line.quantity);
          expect(cents(line.total), `${rate} x ${line.quantity} x ${d}`).toBe(cents(line.dailyTotal) * d);
        }
        expect(cents(priced.dailyTotal)).toBe(priced.lines.reduce((sum, l) => sum + cents(l.dailyTotal), 0));
        expect(cents(priced.total)).toBe(priced.lines.reduce((sum, l) => sum + cents(l.total), 0));
        expect(cents(priced.total)).toBe(cents(priced.dailyTotal) * d);
      }
    }
  });

  it("equipmentLineAmount bills a raw price-list rate to the cent before multiplying", () => {
    // A caller that hands in the unrounded rate still gets $33.34 x 2 = $66.68.
    expect(equipmentLineAmount(33.335, 1, 2)).toBe(66.68);
    // 1.005 * 100 is 100.49999999999999 in floating point; half up is $1.01.
    expect(equipmentLineAmount(1.005, 1, 1)).toBe(1.01);
    // 201 cents over half a day is 100.5 cents: $1.01, not $1.00.
    expect(equipmentLineAmount(2.01, 1, 0.5)).toBe(1.01);
  });

  it("a rate cached on a line with no price-list field is never billed (review 6)", () => {
    expect(() => selectionDailyRate({ groupId: "zz-no-price-list-field", dailyRate: 33.335 }, {})).toThrow(
      RateNotSetError,
    );
  });

  it("part of a day is the daily amount times the days, to the cent", () => {
    const priced = priceStoredEquipment([{ groupId: "lgr-85", quantity: 1 }], { dehumidifierLGRDailyRate: 33.335 }, 0.5);
    expect(priced.lines[0]).toMatchObject({ dailyTotal: 33.34, total: 16.67 });
  });

  it("the AI prompt prints figures that reconcile", () => {
    const text = buildInspectionReportPrompt({
      report: { estimatedDryingDuration: 2 },
      analysis: null,
      stateInfo: null,
      reportType: "detailed",
      psychrometricAssessment: {
        waterClass: 2,
        temperature: 25,
        humidity: 60,
        systemType: "closed",
        dryingPotential: { dryingIndex: 40, status: "FAIR", recommendation: "Add air movement" },
      },
      equipmentSelection: [{ groupId: "lgr-85", quantity: 1 }],
      pricingConfig: { dehumidifierLGRDailyRate: 33.335 },
    } as Parameters<typeof buildInspectionReportPrompt>[0]);
    expect(text).toContain("$33.34");
    expect(text).not.toContain("$66.67");
    expect(text).not.toContain("33.335");
  });
});

// Lead requirement (widened class fix): one property-style check of the cents
// model across fractional and edge values, and the documents downstream of it.
describe("the cents model: every equipment figure is an exact cent amount and reconciles", () => {
  /** True when the double is exactly the value its two-decimal text names. */
  const exactCents = (v: number | null) => v !== null && Number(v.toFixed(2)) === v;
  const c = (v: number | null) => Math.round((v as number) * 100);
  /** Half up on whole cents x days, done in integers (days given in hundredths). */
  const halfUp = (centsTimesHundredths: number) => Math.floor((centsTimesHundredths + 50) / 100);

  const RATES = [
    0, 0.005, 0.01, 0.994, 0.995, 1.005, 2.675, 12.345, 33.335, 49.995, 63.636363, 70, 70.01, 70.014, 70.015,
    99.995, 250.125, 1234.565,
  ];
  const QUANTITIES = [0, 1, 2, 3, 7, 40, 999];
  const DAYS = [0.25, 0.5, 1, 1.5, 2, 2.75, 3, 4, 30, 365];

  it("rate x units = daily amount, daily amount x days = line total (half up), totals = sums of lines", () => {
    let checked = 0;
    for (const rate of RATES) {
      for (const days of DAYS) {
        const priced = priceStoredEquipment(
          QUANTITIES.map((quantity) => ({ groupId: "lgr-85", quantity })),
          { dehumidifierLGRDailyRate: rate },
          days,
        );
        expect(priced.problems, `${rate} over ${days}`).toEqual([]);
        for (const line of priced.lines) {
          const where = `${rate} x ${line.quantity} x ${days}`;
          // Every figure is exactly a cent amount, as a number, not only as text.
          expect(exactCents(line.dailyRate), where).toBe(true);
          expect(exactCents(line.dailyTotal), where).toBe(true);
          expect(exactCents(line.total), where).toBe(true);
          // The rate shown is the rate billed.
          expect(line.dailyRate, where).toBe(billableDailyRate(rate));
          expect(moneyOrRateNotSet(line.dailyRate), where).toBe(`$${billableDailyRate(rate).toFixed(2)}`);
          // rate x units = daily amount, in whole cents.
          expect(c(line.dailyTotal), where).toBe(c(line.dailyRate) * line.quantity);
          // daily amount x days = line total, half up to the cent.
          expect(c(line.total), where).toBe(halfUp(c(line.dailyTotal) * Math.round(days * 100)));
          checked += 1;
        }
        expect(exactCents(priced.dailyTotal)).toBe(true);
        expect(exactCents(priced.total)).toBe(true);
        expect(c(priced.dailyTotal)).toBe(priced.lines.reduce((sum, l) => sum + c(l.dailyTotal), 0));
        expect(c(priced.total)).toBe(priced.lines.reduce((sum, l) => sum + c(l.total), 0));
        // For a whole number of days the job total is also the daily total x days.
        if (Number.isInteger(days)) expect(c(priced.total)).toBe(c(priced.dailyTotal) * days);
      }
    }
    expect(checked).toBe(RATES.length * QUANTITIES.length * DAYS.length);
  });

  it("the half-up cases land on the upper cent", () => {
    expect(billableDailyRate(0.005)).toBe(0.01);
    expect(billableDailyRate(0.995)).toBe(1);
    expect(billableDailyRate(2.675)).toBe(2.68);
    expect(billableDailyRate(49.995)).toBe(50);
    expect(billableDailyRate(1234.565)).toBe(1234.57);
    expect(billableDailyRate(0.994)).toBe(0.99);
    expect(billableDailyRate(70.014)).toBe(70.01);
  });

  // Downstream documents built from the reader's lines.
  const pricing = (lgr: number) =>
    new Proxy({}, { get: (_t, key) => (key === "dehumidifierLGRDailyRate" ? lgr : 50) }) as Record<string, number>;
  const common = {
    report: {
      id: "rep_1",
      reportNumber: "RA-1",
      claimReferenceNumber: "CLM-1",
      waterCategory: "2",
      biologicalMouldDetected: false,
      biologicalMouldCategory: null,
      hazardType: "water damage",
      technicianFieldReport: "Burst flexi hose under the vanity.",
      estimatedDryingDuration: 2,
      inspection: null,
    },
    analysis: null,
    tier1: { T1_Q7_hazards: ["None identified"] },
    tier2: null,
    tier3: null,
    stateInfo: null,
    scopeAreas: [{ length: 8, width: 5, wetPercentage: 100 }],
  };
  const THREE = [
    { groupId: "lgr-85", quantity: 1 },
    { groupId: "lgr-85", quantity: 1 },
    { groupId: "lgr-85", quantity: 1 },
  ];

  it("cost estimation: each equipment row and the equipment total are the reader's cent figures", () => {
    const doc = buildCostEstimationData({
      ...common,
      pricingConfig: pricing(33.335),
      scopeData: { lineItems: [] },
      equipmentSelection: THREE,
      gstTreatment: getGstTreatment("AU"),
    }) as any;
    const days = doc.categories.equipment.lineItems[0].days;
    const reader = priceStoredEquipment(THREE, pricing(33.335), days);
    for (const row of doc.categories.equipment.lineItems) {
      expect(row.dailyRate).toBe(33.34);
      expect(c(row.subtotal)).toBe(3334 * row.qty * row.days);
      expect(exactCents(row.subtotal)).toBe(true);
    }
    // The category total is exactly the reader's job total: no float drift from adding rows.
    expect(doc.categories.equipment.total).toBe(reader.total);
    expect(exactCents(doc.categories.equipment.total)).toBe(true);
  });

  it("scope of works: the equipment group carries the billable rate and the reader's job total", () => {
    const doc = buildScopeOfWorksData({
      ...common,
      pricingConfig: pricing(33.335),
      equipmentSelection: THREE,
    } as Parameters<typeof buildScopeOfWorksData>[0]) as any;
    const rw3 = doc.lineItems.find((i: { id: string }) => i.id === "RW_3");
    const reader = priceStoredEquipment(THREE, pricing(33.335), rw3.equipment.lgr.days);
    expect(rw3.equipment.lgr).toMatchObject({ qty: 3 });
    expect(rw3.equipment.lgr.items.map((i: { dailyRate: number }) => i.dailyRate)).toEqual([33.34, 33.34, 33.34]);
    expect(rw3.subtotal).toBe(4 * 50 + 6 * 50 + (reader.total as number));
  });

  // CodeRabbit on #2533: axial and centrifugal air movers sit in one group at
  // different rates. The document applied the first line's rate to every unit
  // in the group, so its rows disagreed with the RW_3 subtotal.
  it("scope of works: a group whose lines have different rates shows each line at its own rate and amount", () => {
    const mixed = new Proxy({}, {
      get: (_t, key) =>
        key === "airMoverAxialDailyRate" ? 25 : key === "airMoverCentrifugalDailyRate" ? 40.005 : 50,
    }) as Record<string, number>;
    const selection = [
      { groupId: "airmover-800", quantity: 2 },
      { groupId: "airmover-1500", quantity: 3 },
      { groupId: "lgr-85", quantity: 1 },
    ];
    const doc = buildScopeOfWorksData({
      ...common,
      pricingConfig: mixed,
      equipmentSelection: selection,
    } as Parameters<typeof buildScopeOfWorksData>[0]) as any;
    const rw3 = doc.lineItems.find((i: { id: string }) => i.id === "RW_3");
    const days = rw3.equipment.airMovers.days;
    const reader = priceStoredEquipment(selection, mixed, days);
    // No single rate on the group; each line keeps its own.
    expect("rate" in rw3.equipment.airMovers).toBe(false);
    expect(rw3.equipment.airMovers.items).toMatchObject([
      { groupId: "airmover-800", quantity: 2, dailyRate: 25, total: 25 * 2 * days },
      { groupId: "airmover-1500", quantity: 3, dailyRate: 40.01, total: reader.lines[1].total },
    ]);
    const rows = scopeEquipmentRows(rw3.equipment);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain(`2 units × ${days} days @ $25.00/unit/day = $${(25 * 2 * days).toFixed(2)}`);
    expect(rows[1]).toContain(`3 units × ${days} days @ $40.01/unit/day = $${(reader.lines[1].total as number).toFixed(2)}`);
    // The rows the document prints add up to the equipment part of the subtotal, to the cent.
    const printed = rows.map((r) => Math.round(Number(r.slice(r.lastIndexOf("$") + 1)) * 100));
    expect(printed.reduce((a, b) => a + b, 0)).toBe(Math.round((reader.total as number) * 100));
    expect(rw3.subtotal).toBe(4 * 50 + 6 * 50 + (reader.total as number));
  });

  it("scope of works rows: the injection row prints the amount made for it; a missing figure is never $0", () => {
    expect(scopeEquipmentRows({ injectionSystem: { qty: 1, days: 3, rate: 33.34, total: 100.02 } })).toEqual([
      "  - Injection Drying System: 1 units × 3 days @ $33.34/unit/day = $100.02",
    ]);
    const blank = scopeEquipmentRows({ lgr: { days: 2, items: [{ name: "LGR", quantity: 1 }] } });
    expect(blank[0]).not.toContain("$0.00");
    expect(blank[0]).toContain(moneyOrRateNotSet(null));
    expect(scopeEquipmentRows(undefined)).toEqual([]);
  });
});

// Widened class fix, second part: the last places that multiplied or added
// equipment money for themselves now use the same cents model.
describe("the cents model: screens, the prompt table and the viewers add in whole cents", () => {
  it("sumOrNull adds in whole cents (three rows of $66.68 are $200.04 exactly)", async () => {
    const owner = await import("@/lib/reports/stored-equipment-pricing");
    expect(owner.sumOrNull([66.68, 66.68, 66.68])).toBe(200.04);
    expect(owner.sumOrNull([33.34, 33.34, 33.34])).toBe(100.02);
    expect(owner.sumOrNull([])).toBe(0);
    expect(owner.sumOrNull([1, null])).toBeNull();
    expect(owner.sumOrNull([1, Number.NaN])).toBeNull();
  });

  it("the editor's running totals are the owner's figures, exact to the cent", async () => {
    const owner = (await import("@/lib/reports/stored-equipment-pricing")) as any;
    const matrix = (await import("@/lib/equipment-matrix")) as any;
    // One home: the editor totals live with the cents model, not beside the catalogue.
    expect("calculateTotalDailyCost" in matrix).toBe(false);
    expect("calculateTotalCost" in matrix).toBe(false);
    const cfg = { dehumidifierLGRDailyRate: 33.335 };
    const three = [
      { groupId: "lgr-85", quantity: 1 },
      { groupId: "lgr-85", quantity: 1 },
      { groupId: "lgr-85", quantity: 1 },
    ];
    expect(owner.calculateTotalDailyCost(three, cfg)).toBe(100.02);
    expect(owner.calculateTotalCost(three, 2, cfg)).toBe(200.04);
    expect(owner.calculateTotalDailyCost([{ groupId: "lgr-85", quantity: 3 }], cfg)).toBe(100.02);
    // The screen's figure is the figure the server stores, line by line.
    for (const days of [0.5, 1, 2, 2.75, 30]) {
      expect(owner.calculateTotalCost(three, days, cfg), String(days)).toBe(
        priceStoredEquipment(three, cfg, days).total,
      );
      expect(owner.calculateTotalDailyCost(three, cfg)).toBe(priceStoredEquipment(three, cfg, days).dailyTotal);
    }
    // Each line is rounded half up, then the lines are added: 2 x $1.01, not $2.01.
    const half = [
      { groupId: "lgr-85", quantity: 1 },
      { groupId: "lgr-85", quantity: 1 },
    ];
    expect(owner.calculateTotalCost(half, 0.5, { dehumidifierLGRDailyRate: 2.01 })).toBe(2.02);
    // An unset rate still refuses the total.
    expect(() => owner.calculateTotalDailyCost(three, { dehumidifierLGRDailyRate: null })).toThrow(RateNotSetError);
    expect(() => owner.calculateTotalCost(three, 2, { dehumidifierLGRDailyRate: null })).toThrow(RateNotSetError);
  });

  it("the structured report's summary total is the reader's job total, exact to the cent", async () => {
    const { buildStructuredBasicReport } = await import("@/lib/reports/build-structured-report");
    const three = [
      { groupId: "lgr-85", quantity: 1 },
      { groupId: "lgr-85", quantity: 1 },
      { groupId: "lgr-85", quantity: 1 },
    ];
    const doc = buildStructuredBasicReport({
      report: { id: "abcdef1234567890", estimatedDryingDuration: 2 },
      analysis: null,
      stateInfo: null,
      equipmentSelection: three,
      pricingConfig: { dehumidifierLGRDailyRate: 33.335 },
    } as Parameters<typeof buildStructuredBasicReport>[0]) as any;
    expect(doc.equipmentTotal ?? doc.summary.equipmentTotal).toBe(200.04);
    expect(doc.summary.totalCost).toBe(200.04);
  });

  it("the overview prompt's cost table prints the lines' own totals", () => {
    const text = buildInspectionReportPrompt({
      report: { estimatedDryingDuration: 0.5 },
      analysis: null,
      stateInfo: null,
      reportType: "basic",
      equipmentSelection: [{ groupId: "lgr-85", quantity: 1 }],
      pricingConfig: { dehumidifierLGRDailyRate: 2.01 },
    } as Parameters<typeof buildInspectionReportPrompt>[0]);
    // $2.01 a day over half a day is 100.5 cents: $1.01 on the line, so $1.01 in the table.
    expect(text).toContain("| LGR (1) | $2.01 | $1.01 |");
    expect(text).not.toContain("$1.00");
    expect(text).toMatch(/Total Cost:\*\* \$1\.01/);
  });

  // CodeRabbit on #2533: with no equipment stored the overview card read
  // "Total Cost: Rate not set", telling the model a rate was missing.
  it.each([["nothing stored", null], ["an empty list", []]])(
    "the overview prompt has no Total Cost card when the report has no equipment (%s)",
    (_label, equipmentSelection) => {
      const text = buildInspectionReportPrompt({
        report: { estimatedDryingDuration: 2 },
        analysis: null,
        stateInfo: null,
        reportType: "basic",
        equipmentSelection,
        pricingConfig: { dehumidifierLGRDailyRate: 2.01 },
      } as Parameters<typeof buildInspectionReportPrompt>[0]);
      expect(text).toContain("Overview Metrics Cards");
      expect(text).not.toMatch(/Total Cost:/);
    },
  );

  it("the overview card still says the rate is not set when a stored line has no rate", () => {
    const text = buildInspectionReportPrompt({
      report: { estimatedDryingDuration: 2 },
      analysis: null,
      stateInfo: null,
      reportType: "basic",
      equipmentSelection: [{ groupId: "lgr-85", quantity: 1 }],
      pricingConfig: { dehumidifierLGRDailyRate: null },
    } as Parameters<typeof buildInspectionReportPrompt>[0]);
    expect(text).toContain(`Total Cost:** ${moneyOrRateNotSet(null)}`);
  });
});

// Review 5: a rate shown is the rate billed, wherever an equipment price-list
// rate is read. 49.995 is $50.00 a day, never "$49.99" beside a $50.00 bill.
describe("the billable rate is the rate every screen and document shows", () => {
  it("the rate the entry form and the editor read is the billable rate", async () => {
    const { getEquipmentDailyRateOrNull, selectionDailyRateOrNull } = await import("@/lib/equipment-matrix");
    const cfg = { dehumidifierLGRDailyRate: 49.995 };
    expect(getEquipmentDailyRateOrNull("lgr-85", cfg)).toBe(50);
    expect(`$${(getEquipmentDailyRateOrNull("lgr-85", cfg) as number).toFixed(2)}/day`).toBe("$50.00/day");
    expect(selectionDailyRateOrNull({ groupId: "lgr-85" }, cfg)).toBe(50);
    expect(getEquipmentDailyRateOrNull("lgr-85", null)).toBeNull();
    // An id with no price-list field never reads the price list by its own name (review 6).
    expect(getEquipmentDailyRateOrNull("zz-no-price-list-field", { "zz-no-price-list-field": 49.995 })).toBeNull();
    expect(getEquipmentDailyRateOrNull("lgr-85", { dehumidifierLGRDailyRate: null })).toBeNull();
  });

  const pricing = (injection: number) =>
    new Proxy({}, { get: (_t, key) => (key === "injectionDryingSystemDailyRate" ? injection : 50) }) as Record<
      string,
      number
    >;
  const class4 = {
    report: {
      id: "rep_1",
      reportNumber: "RA-1",
      claimReferenceNumber: "CLM-1",
      waterCategory: "2",
      biologicalMouldDetected: false,
      biologicalMouldCategory: null,
      hazardType: "water damage",
      technicianFieldReport: "Burst flexi hose under the vanity.",
      estimatedDryingDuration: 3,
      inspection: null,
    },
    analysis: null,
    tier1: { T1_Q7_hazards: ["None identified"], T1_Q6_materialsAffected: ["Yellow tongue particleboard"] },
    tier2: null,
    tier3: { T3_Q5_class4DryingAssessment: "Class 4 specialty drying required" },
    stateInfo: null,
    scopeAreas: [{ length: 8, width: 5, wetPercentage: 100 }],
  };

  it("cost estimation: the injection drying line shows and bills the billable rate", () => {
    const doc = buildCostEstimationData({
      ...class4,
      pricingConfig: pricing(49.995),
      scopeData: { lineItems: [] },
      equipmentSelection: null,
      gstTreatment: getGstTreatment("AU"),
    }) as any;
    const row = doc.categories.dryingSystems.lineItems[0];
    expect(row.dailyRate).toBe(50);
    expect(row.subtotal).toBe(50 * row.days);
    expect(doc.categories.dryingSystems.total).toBe(row.subtotal);
  });

  it("scope of works: the injection drying line shows and bills the billable rate", () => {
    const doc = buildScopeOfWorksData({
      ...class4,
      pricingConfig: pricing(49.995),
      equipmentSelection: null,
    } as Parameters<typeof buildScopeOfWorksData>[0]) as any;
    const item = doc.lineItems.find((i: any) => i.equipment?.injectionSystem);
    expect(item.equipment.injectionSystem.rate).toBe(50);
    expect(item.subtotal).toBe(12 * 50 + 8 * 50 + 50 * item.equipment.injectionSystem.days);
  });
});

// Review 6: every catalogue group has a price-list rate, so there is no line
// the cached rate can lawfully price. A type the price list does not price is
// an unusable line for every reader; its cached rate is never money.
describe("an equipment type the price list does not price is unusable, never priced from its cached rate", () => {
  const CFG = { dehumidifierLGRDailyRate: 70, callOutFee: 99 };
  // CodeRabbit on #2533: an id that only STARTS like a catalogue group
  // ("lgr-bogus", "lgr-85 " with a trailing space) was priced at that
  // prefix's rate. The id must be a catalogue group.
  it.each([
    ["   "], ["no-such-group"], ["callOutFee"], [" lgr-85 "], ["\t"],
    ["lgr-bogus"], ["lgr-85 "], ["lgr-"], ["desiccant-x"], ["airmover-zzz"], ["afd-"], ["heat-x"], ["LGR-85"],
  ])("id %j", (groupId) => {
    for (const config of [null, CFG]) {
      const priced = priceStoredEquipment([{ groupId, quantity: 1, dailyRate: 61 }], config, 4);
      expect(priced.lines[0]).toMatchObject({ usable: false, dailyRate: null, dailyTotal: null, total: null });
      expect(priced.total).toBeNull();
      expect(priced.dailyTotal).toBeNull();
      expect(priced.problems.length).toBeGreaterThan(0);
      expect(JSON.stringify(priced)).not.toContain("61");
      expect(JSON.stringify(priced)).not.toContain("244");
      expect(() => assertEquipmentPriced(priced)).toThrow();
    }
    expect(readStoredEquipment([{ groupId, quantity: 1, dailyRate: 61 }])[0].usable).toBe(false);
  });

  it("a usable line beside one is still priced, and the total stays blocked", () => {
    const priced = priceStoredEquipment(
      [
        { groupId: "lgr-85", quantity: 1 },
        { groupId: "no-such-group", quantity: 1, dailyRate: 61 },
      ],
      CFG,
      4,
    );
    expect(priced.lines[0]).toMatchObject({ usable: true, dailyRate: 70, total: 280 });
    expect(priced.lines[1].usable).toBe(false);
    expect(priced.total).toBeNull();
  });

  it("the rate reader never uses a cached rate and never reads the price list by an arbitrary id", async () => {
    const m = await import("@/lib/equipment-matrix");
    expect(() => m.selectionDailyRate({ groupId: "no-such-group", dailyRate: 61 }, CFG)).toThrow(RateNotSetError);
    expect(() => m.selectionDailyRate({ groupId: "   ", dailyRate: 61 }, CFG)).toThrow(RateNotSetError);
    expect(m.selectionDailyRateOrNull({ groupId: "no-such-group", dailyRate: 61 }, CFG)).toBeNull();
    expect(m.getEquipmentDailyRateOrNull("callOutFee", CFG)).toBeNull();
    expect(() => m.getEquipmentDailyRate("callOutFee", CFG)).toThrow(RateNotSetError);
    // Control: every catalogue group has a price-list field, so none depends on a cached rate.
    for (const group of m.getAllEquipmentGroups()) {
      expect(m.getEquipmentPricingField(group.id), group.id).not.toBeNull();
    }
    // Control: a catalogue line ignores its cached rate and takes the price list's.
    expect(m.selectionDailyRate({ groupId: "lgr-85", dailyRate: 61 }, CFG)).toBe(70);
  });
});
