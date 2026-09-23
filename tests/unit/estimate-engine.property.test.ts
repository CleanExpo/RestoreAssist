/**
 * RA-7708 money oracle — property tests for the estimate engine.
 *
 * Drives the same public functions the two CostEstimate writers use
 * (estimateCosts -> buildEstimateLines) and checks the rows they persist.
 *
 * Live defect this guards (job NIR-2026-09-F1C142): every line carried
 * +54.216 because the job-level contingency was spread across the lines,
 * and 12 required scope items became 5 lines because unknown item types
 * were dropped silently.
 */
import { describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import Decimal from "decimal.js";

// estimateCosts imports prisma for the company-rates lookup; every call here
// passes pricingRates or no userId, so the DB is never reached.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  estimateCosts,
  type CompanyPricingRates,
} from "@/lib/nir-cost-estimation";
import { buildEstimateLines, lineTotal } from "@/lib/estimate-lines";
import { NRPG_RATE_RANGES } from "@/lib/nrpg-rate-ranges";
import { resolveAreaSqm } from "@/lib/units";
import { formatNirCostLine } from "@/lib/nir-report-generation";

const expected = (qty: number, rate: number) =>
  new Decimal(qty).mul(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

const isContingency = (d: string) => d.startsWith("Contingency");
const NO_RATE = "No rate configured";

/** A complete rate card at NRPG midpoints, with overrides. */
function ratesWith(overrides: Partial<CompanyPricingRates>) {
  const base = Object.fromEntries(
    Object.entries(NRPG_RATE_RANGES).map(([k, r]) => [k, (r.min + r.max) / 2]),
  ) as unknown as CompanyPricingRates;
  return { ...base, ...overrides };
}

function sumTotals(lines: { total: number }[]) {
  return lines.reduce((s, l) => s.plus(l.total), new Decimal(0));
}

describe("RA-7708 money oracle: line total = qty x rate", () => {
  it("1. every emitted line total equals Decimal(qty x rate) at 2dp HALF_UP", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: 0.1, max: 500, noNaN: true }),
        fc.double({ min: 0.01, max: 5000, noNaN: true }),
        async (qty, rate) => {
          const est = await estimateCosts(
            [
              {
                itemType: "install_dehumidification",
                description: "Dehumidification",
                quantity: qty,
              },
            ],
            null,
            ratesWith({ dehumidifierLGRDailyRate: rate }),
            null,
          );
          const lines = buildEstimateLines(est);
          const priced = lines.filter((l) => !isContingency(l.description));
          expect(priced).toHaveLength(1);
          const want = expected(qty, rate).toNumber();
          expect(priced[0].total).toBe(want);
          expect(priced[0].subtotal).toBe(want);
          // Grand total the UI shows equals the sum of persisted line totals.
          expect(sumTotals(lines).toNumber()).toBe(est.total);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("2. qty = 0 gives a line total of 0 (no constant term)", () => {
    fc.assert(
      fc.property(fc.double({ min: 0.01, max: 5000, noNaN: true }), (rate) => {
        expect(lineTotal(0, rate)).toBe(0);
      }),
    );
  });

  it("2b. lineTotal matches the Decimal oracle for all qty/rate", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 500, noNaN: true }),
        fc.double({ min: 0.01, max: 5000, noNaN: true }),
        (qty, rate) => {
          expect(lineTotal(qty, rate)).toBe(expected(qty, rate).toNumber());
        },
      ),
      {
        numRuns: 1000,
        // Float traps: 1.005 x 1 rounds to 1.00 under Math.round(x*100)/100.
        examples: [
          [1.005, 1],
          [0.1, 0.44999999999999996],
        ],
      },
    );
  });
});

describe("RA-7708 money oracle: NIR-2026-09-F1C142 fixture", () => {
  // Rates are the NRPG midpoints (no company config), as on the live job.
  const cat2 = "IICRC S500 Category 2 water";
  const fixture = [
    {
      itemType: "install_dehumidification",
      description: "Dehumidification",
      quantity: 5,
      justification: cat2,
    },
    {
      itemType: "install_air_movers",
      description: "Air movers",
      quantity: 5,
      justification: cat2,
    },
    {
      itemType: "extract_standing_water",
      description: "Extraction",
      quantity: 2,
      justification: cat2,
    },
    {
      itemType: "remove_carpet",
      description: "Carpet",
      quantity: 22,
      justification: cat2,
    },
    {
      itemType: "dry_out_structure",
      description: "Dry out",
      quantity: 5,
      justification: cat2,
    },
  ];

  it("3. lines are 325 / 175 / 225 / 484 / 1050, contingency is ONE separate line, lines sum to the grand total", async () => {
    const est = await estimateCosts(fixture, null, null, null);
    const lines = buildEstimateLines(est);

    const priced = lines.filter((l) => !isContingency(l.description));
    expect(priced.map((l) => l.total)).toEqual([
      325.0, 175.0, 225.0, 484.0, 1050.0,
    ]);
    expect(priced.every((l) => l.contingency === 0)).toBe(true);

    const cont = lines.filter((l) => isContingency(l.description));
    expect(cont).toHaveLength(1);
    // 2259.00 x 12% (Category 2) = 271.08
    expect(cont[0].description).toBe("Contingency (12%)");
    expect(cont[0].quantity).toBe(1);
    expect(cont[0].rate).toBe(271.08);
    expect(cont[0].total).toBe(271.08);

    expect(est.subtotal).toBe(2259.0);
    expect(est.total).toBe(2530.08);
    expect(sumTotals(lines).toNumber()).toBe(est.total);
    // Report readers sum subtotal / contingency / total columns separately.
    expect(sumTotals(lines.map((l) => ({ total: l.subtotal }))).toNumber()).toBe(
      2259.0,
    );
    expect(
      sumTotals(lines.map((l) => ({ total: l.contingency }))).toNumber(),
    ).toBe(271.08);
  });

  it("3b. contingency % ignores unpriced items (an unpriced asbestos item adds no +2%)", async () => {
    const est = await estimateCosts(
      [
        ...fixture,
        {
          itemType: "asbestos_removal_unpriced",
          description: "Asbestos removal",
          quantity: 1,
        },
      ],
      null,
      null,
      null,
    );
    expect(est.contingencyPercentage).toBe(12);
    expect(est.contingency).toBe(271.08);
  });
});

describe("RA-7708 money oracle: no silent drops", () => {
  it("4. every required scope item yields a line, priced or an explicit $0 'No rate configured' warning", async () => {
    const scope = [
      { itemType: "air_mover", description: "Air mover", quantity: 4 },
      {
        itemType: "lgr_dehumidifier",
        description: "LGR dehumidifier",
        quantity: 2,
      },
      {
        itemType: "deploy_air_movers",
        description: "Deploy air movers",
        quantity: null,
      },
      {
        itemType: "mystery_item_xyz",
        description: "Mystery item",
        quantity: 3,
      },
    ];
    const est = await estimateCosts(scope, null, null, null);
    const lines = buildEstimateLines(est).filter(
      (l) => !isContingency(l.description),
    );
    expect(lines).toHaveLength(scope.length);

    for (const l of lines) {
      const warned = l.description.startsWith(NO_RATE);
      if (warned) {
        expect(l.total).toBe(0);
        expect(l.rate).toBe(0);
      } else {
        expect(l.total).toBeGreaterThan(0);
        expect(l.total).toBe(expected(l.quantity, l.rate).toNumber());
      }
    }

    const byDesc = (d: string) => lines.find((l) => l.description.endsWith(d));
    // Aliased onto the catalog, so priced.
    expect(byDesc("Air mover")?.description).toBe("Air mover");
    expect(byDesc("LGR dehumidifier")?.description).toBe("LGR dehumidifier");
    expect(byDesc("Deploy air movers")?.description).toBe("Deploy air movers");
    // Unknown type: explicit warning line, never dropped.
    expect(byDesc("Mystery item")?.description).toBe(
      `${NO_RATE}: Mystery item`,
    );
    const engineWarning = est.items.find((i) =>
      i.description.endsWith("Mystery item"),
    ) as { warning?: string } | undefined;
    expect(engineWarning?.warning).toBe("NO_RATE_CONFIGURED");
  });
});

describe("RA-7708 money oracle: area units", () => {
  it("5. a 29.5 m2 area item is priced on 29.5, not 317.5 (ft2)", async () => {
    expect(resolveAreaSqm({ affectedAreaSqm: 29.5 })).toBe(29.5);
    const sqm = resolveAreaSqm({ affectedAreaSqm: 29.5 });
    const est = await estimateCosts(
      [{ itemType: "remove_carpet", description: "Carpet", quantity: sqm }],
      null,
      null,
      null,
    );
    const line = buildEstimateLines(est).find(
      (l) => !isContingency(l.description),
    )!;
    expect(line.quantity).toBe(29.5);
    expect(line.unit).toBe("m²");
    expect(line.subtotal).toBe(649.0); // 29.5 x $22
  });
});

describe("RA-7708 money oracle: printed rows", () => {
  const cat2 = "IICRC S500 Category 2 water";
  const scope = [
    ["install_dehumidification", "Dehumidification", 5],
    ["install_air_movers", "Air movers", 5],
    ["extract_standing_water", "Extraction", 2],
    ["remove_carpet", "Carpet", 22],
    ["dry_out_structure", "Dry out", 5],
  ].map(([itemType, description, quantity]) => ({
    itemType: itemType as string,
    description: description as string,
    quantity: quantity as number,
    justification: cat2,
  }));

  it("6. the NIR PDF prints every persisted row at its total; contingency reads 'Contingency (12%) ... $271.08'", async () => {
    const est = await estimateCosts(scope, null, null, null);
    const rows = buildEstimateLines(est).map((l, i) => ({
      id: `ce${i}`,
      ...l,
    }));
    const printed = rows.map((r) => formatNirCostLine(r));

    const cont = printed.filter((t) => t.startsWith("Contingency"));
    expect(cont).toHaveLength(1);
    expect(cont[0]).toBe("Contingency (12%): 1 job @ $271.08 AUD = $271.08 AUD");
    expect(cont[0]).not.toContain("$0.00");

    rows.forEach((r, i) => {
      expect(printed[i].endsWith(`= $${r.total.toFixed(2)} AUD`)).toBe(true);
    });
    // Priced rows are unchanged: their subtotal equals their total.
    expect(printed[0]).toBe(
      "Dehumidification: 5 day @ $65.00 AUD = $325.00 AUD",
    );
  });

  it("6b. a stored pre-fix row (per-line contingency share) still prints its own qty x rate", () => {
    expect(
      formatNirCostLine({
        id: "legacy",
        description: "Dehumidification",
        quantity: 5,
        unit: "day",
        rate: 65,
        subtotal: 325,
        contingency: 54.216,
        total: 379.216,
      }),
    ).toBe("Dehumidification: 5 day @ $65.00 AUD = $325.00 AUD");
  });
});
