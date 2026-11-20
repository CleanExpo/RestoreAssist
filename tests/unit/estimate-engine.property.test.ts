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
// passes pricingRates or no userId, so the DB is never reached. The quote
// route (RA-7705 block below) reads the user twice: subscription, then org.
const { userFindUnique, resolvePricing } = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  resolvePricing: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: userFindUnique } },
}));
vi.mock("next-auth", () => ({
  getServerSession: vi.fn().mockResolvedValue({ user: { id: "user_abcd" } }),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/pricing/effective-pricing", () => ({
  resolveEffectivePricing: resolvePricing,
}));

import {
  estimateCosts,
  type CompanyPricingRates,
} from "@/lib/nir-cost-estimation";
import { buildEstimateLines, lineTotal } from "@/lib/estimate-lines";
import { NRPG_RATE_RANGES } from "@/lib/nrpg-rate-ranges";
import { resolveAreaSqm } from "@/lib/units";
import { formatNirCostLine } from "@/lib/nir-report-generation";
import { NextRequest } from "next/server";
import { POST as calculateQuote } from "@/app/api/calculate/route";
import {
  quoteGstAsInvoiced,
  quoteToInvoiceLineItems,
} from "@/lib/quotes/quote-calc";
import { calculateInvoiceTotals } from "@/lib/invoices/calc";
import { computeGstCents, getGstTreatment } from "@/lib/gst-rules";

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

/* ─── RA-7705 money oracle: quote → GST → invoice draft ─── */

const SEED = 7705;
const RUNS = 500;

/** Integer cents, HALF_UP — the oracle every money number is checked against. */
const halfUpCents = (d: Decimal) =>
  d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
const dollarsAsCents = (dollars: number) => new Decimal(dollars).mul(100);
const gstOracleCents = (exCents: number, ratePercent: number) =>
  halfUpCents(new Decimal(exCents).mul(ratePercent).div(100));

/** A 2dp money (or quantity) value in [min, max], as a user would type it. */
const twoDp = (min: number, max: number) =>
  fc
    .integer({ min: Math.round(min * 100), max: Math.round(max * 100) })
    .map((c) => c / 100);

const RATE_KEYS = [
  "masterQualifiedNormalHours",
  "masterQualifiedSaturday",
  "masterQualifiedSunday",
  "qualifiedTechnicianNormalHours",
  "qualifiedTechnicianSaturday",
  "qualifiedTechnicianSunday",
  "labourerNormalHours",
  "labourerSaturday",
  "labourerSunday",
  "airMoverAxialDailyRate",
  "airMoverCentrifugalDailyRate",
  "dehumidifierLGRDailyRate",
  "dehumidifierDesiccantDailyRate",
  "afdUnitLargeDailyRate",
  "extractionTruckMountedHourlyRate",
  "extractionElectricHourlyRate",
  "injectionDryingSystemDailyRate",
  "antimicrobialTreatmentRate",
  "mouldRemediationTreatmentRate",
  "biohazardTreatmentRate",
  "administrationFee",
  "callOutFee",
  "thermalCameraUseCostPerAssessment",
] as const;

/**
 * Pricing config stores rates as Float and validates range, not decimal
 * places, so a sub-cent rate such as $65.005 is a valid stored rate.
 */
const threeDp = (min: number, max: number) =>
  fc
    .integer({ min: Math.round(min * 1000), max: Math.round(max * 1000) })
    .map((m) => m / 1000);

const arbRates = fc.record(
  Object.fromEntries(
    RATE_KEYS.map((k) => [k, fc.oneof(twoDp(0.01, 5000), threeDp(0.001, 5000))]),
  ) as Record<
    (typeof RATE_KEYS)[number],
    fc.Arbitrary<number>
  >,
);

const arbQuoteInput = fc.record({
  jobType: fc.constantFrom("water", "fire", "mould", "storm", "bioclean"),
  affectedAreaM2: twoDp(1, 500),
  numberOfRooms: fc.integer({ min: 1, max: 50 }),
  dryingDays: fc.integer({ min: 1, max: 30 }),
  labourHours: twoDp(0, 500),
  labourTier: fc.constantFrom(
    "masterQualified",
    "qualifiedTechnician",
    "labourer",
  ),
  labourPeriod: fc.constantFrom("NormalHours", "Saturday", "Sunday"),
  airMoversAxial: fc.integer({ min: 0, max: 20 }),
  airMoversCentrifugal: fc.integer({ min: 0, max: 20 }),
  dehumidifiersLGR: fc.integer({ min: 0, max: 20 }),
  dehumidifiersDesiccant: fc.integer({ min: 0, max: 20 }),
  afdUnitsLarge: fc.integer({ min: 0, max: 10 }),
  extractionTruckMountedHours: twoDp(0, 24),
  extractionElectricHours: twoDp(0, 24),
  injectionDryingDays: fc.integer({ min: 0, max: 30 }),
  includeCallOut: fc.boolean(),
  includeAdminFee: fc.boolean(),
  includeThermalCamera: fc.boolean(),
});

interface QuoteJson {
  lineItems: Array<{ description: string; qty: number; rate: number; subtotal: number }>;
  subtotalExGST: number;
  gst: number;
  totalIncGST: number;
  minimumApplied: boolean;
}

async function runQuote(
  input: Record<string, unknown>,
  rates: Record<string, number>,
  country: "AU" | "NZ",
): Promise<QuoteJson> {
  resolvePricing.mockResolvedValueOnce(rates);
  // RA-7893: the plan gate resolves the business owner first (more than one
  // user read), so answer by what each read selects rather than by call order.
  userFindUnique.mockImplementation(
    async ({ select }: { select?: Record<string, unknown> }) =>
      select?.subscriptionStatus
        ? { id: "user_abcd", subscriptionStatus: "ACTIVE" }
        : select?.businessName
          ? { organization: { country } }
          : {},
  );
  const res = await calculateQuote(
    new NextRequest("http://localhost/api/calculate", {
      method: "POST",
      body: JSON.stringify(input),
      headers: { "content-type": "application/json" },
    }),
  );
  expect(res.status).toBe(200);
  return (await res.json()) as QuoteJson;
}

/** Review finding P1 (3c72df87): 50 h at a valid stored rate of $65.005. */
const codexSubCentRate: [
  Record<string, unknown>,
  Record<(typeof RATE_KEYS)[number], number>,
  "AU" | "NZ",
] = [
  {
    jobType: "water",
    affectedAreaM2: 1,
    numberOfRooms: 1,
    dryingDays: 1,
    labourHours: 50,
    labourTier: "qualifiedTechnician",
    labourPeriod: "NormalHours",
    airMoversAxial: 0,
    airMoversCentrifugal: 0,
    dehumidifiersLGR: 0,
    dehumidifiersDesiccant: 0,
    afdUnitsLarge: 0,
    extractionTruckMountedHours: 0,
    extractionElectricHours: 0,
    injectionDryingDays: 0,
    includeCallOut: false,
    includeAdminFee: false,
    includeThermalCamera: false,
  },
  {
    ...(Object.fromEntries(RATE_KEYS.map((k) => [k, 0.01])) as Record<
      (typeof RATE_KEYS)[number],
      number
    >),
    qualifiedTechnicianNormalHours: 65.005,
    antimicrobialTreatmentRate: 0,
  },
  "AU",
];

describe("RA-7705 money oracle: quote → GST → invoice draft", () => {
  it("7. quote: each line = qty x rate, ex-GST = Σ lines (or the minimum), GST = Σ per-line GST (the invoice rule), inc = ex + GST, and the invoice draft carries the same three amounts", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbQuoteInput,
        arbRates,
        fc.constantFrom<"AU" | "NZ">("AU", "NZ"),
        async (input, rates, country) => {
          const q = await runQuote(input, rates, country);
          const ratePercent = getGstTreatment(country).ratePercent;

          let sumLines = 0;
          let gstCents = 0;
          for (const l of q.lineItems) {
            // The quote prices every line on a whole-cent unit rate, the
            // same unit price its invoice draft carries.
            expect(dollarsAsCents(l.rate).isInteger()).toBe(true);
            const want = halfUpCents(new Decimal(l.qty).mul(l.rate).mul(100));
            expect(dollarsAsCents(l.subtotal).toNumber()).toBe(want);
            sumLines += want;
            gstCents += gstOracleCents(want, ratePercent);
          }
          const exCents = Math.max(sumLines, 275000);
          expect(q.minimumApplied).toBe(sumLines < 275000);
          expect(dollarsAsCents(q.subtotalExGST).toNumber()).toBe(exCents);

          // GST is taken per line, as the invoice does (the minimum-charge
          // top-up is its own line), so it sits within half a cent per line
          // of rate x ex-GST.
          const draftLines = q.lineItems.length + (q.minimumApplied ? 1 : 0);
          if (q.minimumApplied) {
            gstCents += gstOracleCents(exCents - sumLines, ratePercent);
          }
          expect(
            Math.abs(gstCents - (exCents * ratePercent) / 100),
          ).toBeLessThanOrEqual(draftLines / 2);
          expect(dollarsAsCents(q.gst).toNumber()).toBe(gstCents);
          expect(dollarsAsCents(q.totalIncGST).toNumber()).toBe(
            exCents + gstCents,
          );

          // Quote → AR invoice draft: the page posts these lines; the invoice
          // API persists calculateInvoiceTotals of them.
          const inv = calculateInvoiceTotals({
            lineItems: quoteToInvoiceLineItems(q, ratePercent),
            defaultGstRatePercent: ratePercent,
          });
          expect(inv.subtotalExGST).toBe(exCents);
          expect(inv.gstAmount).toBe(gstCents);
          expect(inv.totalIncGST).toBe(exCents + gstCents);
        },
      ),
      { numRuns: RUNS, seed: SEED, examples: [codexSubCentRate] },
    );
  });

  it("7b. 50 h at a stored $65.005 rate: quote and invoice draft both price $65.01 x 50 = $3,250.50", async () => {
    const [input, rates, country] = codexSubCentRate;
    const q = await runQuote(input, rates, country);
    const labour = q.lineItems.find((l) => l.description.startsWith("Labour"))!;
    expect(labour.rate).toBe(65.01);
    expect(labour.subtotal).toBe(3250.5);
    expect(q.subtotalExGST).toBe(3250.5);
    expect(q.gst).toBe(325.05);
    expect(q.totalIncGST).toBe(3575.55);
    const inv = calculateInvoiceTotals({
      lineItems: quoteToInvoiceLineItems(q, 10),
      defaultGstRatePercent: 10,
    });
    expect(inv).toEqual({
      subtotalExGST: 325050,
      gstAmount: 32505,
      totalIncGST: 357555,
    });
  });

  // The literal 65.00499999999999 is the same double as 65.005 (test 7b), so
  // no function can price it differently. 65.00499999999998 is a distinct
  // double genuinely below half a cent; denoising to 15 digits rounded it up.
  it("7c. a stored rate of 65.00499999999998 is below half a cent: priced at $65.00, not $65.01", async () => {
    expect(Number("65.00499999999999")).toBe(65.005);
    const [input, rates, country] = codexSubCentRate;
    const q = await runQuote(
      input,
      { ...rates, qualifiedTechnicianNormalHours: 65.00499999999998 },
      country,
    );
    const labour = q.lineItems.find((l) => l.description.startsWith("Labour"))!;
    expect(labour.rate).toBe(65);
    expect(labour.subtotal).toBe(3250);
    expect(q.subtotalExGST).toBe(3250);
  });

  it("8. a one-line quote: GST = rate x ex-GST to the cent, inc = ex + GST", () => {
    fc.assert(
      fc.property(
        twoDp(2750, 1_000_000),
        fc.constantFrom<"AU" | "NZ">("AU", "NZ"),
        (ex, country) => {
          const exCents = dollarsAsCents(ex).toNumber();
          const want = gstOracleCents(
            exCents,
            getGstTreatment(country).ratePercent,
          );
          const { gst, totalIncGST } = quoteGstAsInvoiced(
            {
              lineItems: [{ description: "Job", qty: 1, rate: ex }],
              subtotalExGST: ex,
            },
            country,
          );
          expect(dollarsAsCents(gst).toNumber()).toBe(want);
          expect(dollarsAsCents(totalIncGST).toNumber()).toBe(exCents + want);
        },
      ),
      { numRuns: RUNS, seed: SEED, examples: [[2750.85, "AU"], [2750.7, "NZ"]] },
    );
  });

  it("9. computeGstCents (accounting sync): GST = rate x ex-GST to the cent", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.constantFrom<"AU" | "NZ">("AU", "NZ"),
        (exCents, country) => {
          expect(computeGstCents(exCents, country)).toBe(
            gstOracleCents(exCents, getGstTreatment(country).ratePercent),
          );
        },
      ),
      { numRuns: RUNS, seed: SEED },
    );
  });

  it("10. invoice totals: each line = qty x unit price, per-line GST at its rate, inc = ex + GST; qty 0 adds nothing", () => {
    const arbLine = fc.record({
      quantity: twoDp(0, 500),
      unitPrice: fc.integer({ min: 1, max: 500_000 }),
      gstRate: fc.constantFrom(0, 10),
    });
    fc.assert(
      fc.property(fc.array(arbLine, { minLength: 1, maxLength: 12 }), (lines) => {
        let ex = 0;
        let gst = 0;
        for (const l of lines) {
          const sub = halfUpCents(new Decimal(l.quantity).mul(l.unitPrice));
          ex += sub;
          gst += gstOracleCents(sub, l.gstRate);
        }
        const t = calculateInvoiceTotals({
          lineItems: lines,
          defaultGstRatePercent: 10,
        });
        expect(t.subtotalExGST).toBe(ex);
        expect(t.gstAmount).toBe(gst);
        expect(t.totalIncGST).toBe(t.subtotalExGST + t.gstAmount);

        const zeroed = calculateInvoiceTotals({
          lineItems: lines.map((l) => ({ ...l, quantity: 0 })),
          defaultGstRatePercent: 10,
        });
        expect(zeroed).toEqual({ subtotalExGST: 0, gstAmount: 0, totalIncGST: 0 });
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });
});
