/**
 * RA-8281 step 1: contractors never see the NRPG range figures.
 *
 * Founder rule (Phill, 2026-11-12): "We don't show our guideline or price."
 * The min and max in lib/nrpg-rate-ranges.ts are NRPG's private reference
 * data. They may be read to check a value; they may never be shown.
 *
 * This guard produces every contractor-facing output that used to carry a
 * range (blocked lines, their notes, the blocked 422 body, the assessment
 * and NIR estimates, the fire scope, the stored equipment lines) for fields
 * whose range is known, and fails when a min or a max appears anywhere in
 * it. The pricing-config 400, the blocked-pricing screen and the document
 * routes are held by the same check (expectNoRangeFigure) in:
 *   - app/api/pricing-config/__tests__/range-refusal.ra8281.test.ts
 *   - components/__tests__/blocked-pricing-screens.test.tsx
 *   - the four route.blocked-line.test.ts files
 *
 * The source scans at the end hold the two structural rules: only the named
 * validators import the range file, and no file a browser loads reaches it.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { estimateFromPriceList } from "@/lib/assessments/price-list-estimate";
import { validatePricingConfig } from "@/lib/billing/company-pricing-service";
import { getGstTreatment } from "@/lib/gst-rules";
import {
  blockedEstimatePricing,
  estimateCosts,
  validatePricingConfigNRPG,
} from "@/lib/nir-cost-estimation";
import { NRPG_RATE_RANGES } from "@/lib/nrpg-rate-ranges";
import {
  blockedPricing,
  blockedRates,
  isBlockedResult,
  priceListReader,
} from "@/lib/pricing/blocked-line";
import { blockedPricingResponse } from "@/lib/pricing/blocked-line-response";
import { BASE_RATE_LABELS } from "@/lib/pricing/rate-input";
import {
  BASE_RATE_FIELDS,
  RateNotSetError,
  requireRate,
} from "@/lib/pricing/rate-not-set";
import { equipmentLineBlockedFields } from "@/lib/reports/stored-equipment-pricing";
import { generateFireScope, readRate } from "@/lib/scope-fire";
import { expectNoRangeFigure } from "@/lib/pricing/__tests__/no-range-figure";

const RANGED_FIELDS = Object.keys(NRPG_RATE_RANGES);
const AU = getGstTreatment("AU");

/** A value below the field's min and one above its max, neither a range figure. */
function outsideRange(field: string): { below: number; above: number } {
  const { min, max } = NRPG_RATE_RANGES[field];
  return { below: min / 2, above: max * 3 + 0.37 };
}

/** A quantity that is not the field's min or max, so a match is a real leak. */
function safeQuantity(field: string): number {
  const { min, max } = NRPG_RATE_RANGES[field];
  return [7, 9, 11].find((q) => q !== min && q !== max)!;
}

describe("the guard itself", () => {
  it("has ranges to check, and its check fails on a planted figure", () => {
    expect(RANGED_FIELDS.length).toBeGreaterThanOrEqual(BASE_RATE_FIELDS.length);
    const { min, max } = NRPG_RATE_RANGES.callOutFee;
    for (const leak of [
      `Rate not set (national range $${min}-$${max})`,
      { field: "callOutFee", min },
      { field: "callOutFee", max },
      { nationalRange: null },
    ]) {
      expect(() => expectNoRangeFigure(leak, "callOutFee")).toThrow();
    }
    expect(() =>
      expectNoRangeFigure("Rate not set. Set callOutFee.", "callOutFee"),
    ).not.toThrow();
  });
});

describe.each(RANGED_FIELDS)("%s: no range figure is shown", (field) => {
  it("as a blocked rate, a blocked line or a refused read", () => {
    const [rate] = blockedRates({ [field]: null }, [field]);
    expect(rate.note).toBe(`Rate not set. Set ${field} in your price list.`);
    expectNoRangeFigure(rate, field);

    const reader = priceListReader({ [field]: null });
    const lineFields = reader.lineFields([field]);
    expect(lineFields).toMatchObject({ pricingStatus: "rate_not_set" });
    expectNoRangeFigure(lineFields, field);
    expectNoRangeFigure(reader.missing(), field);

    let thrown: unknown;
    try {
      requireRate({ [field]: null }, field);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(RateNotSetError);
    expectNoRangeFigure((thrown as RateNotSetError).message, field);
    expectNoRangeFigure((thrown as RateNotSetError).unset, field);
  });

  it("in the blocked 422 body a route answers with", async () => {
    const reader = priceListReader({ [field]: null });
    const res = blockedPricingResponse(
      blockedPricing(
        [
          {
            description: "Blocked line",
            quantity: safeQuantity(field),
            unit: "unit",
            rate: null,
            subtotal: null,
            ...reader.lineFields([field]),
            pricingStatus: "rate_not_set",
          },
        ],
        reader.missing(),
      ),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.blocked.missing).toHaveLength(1);
    expectNoRangeFigure(body, field);
  });

  it("when the rate is not set, or is set outside the range", () => {
    const unset = readRate({}, field);
    expect(unset.status).toBe("rate_not_set");
    expectNoRangeFigure(unset, field);

    const { below, above } = outsideRange(field);
    for (const value of [below, above]) {
      const read = readRate({ [field]: value }, field);
      // The refusal still happens: only the figures are withheld.
      expect(read.status).toBe("rate_out_of_range");
      expectNoRangeFigure(read, field);
    }
  });

  it("in an assessment estimate priced from the price list", () => {
    const { below, above } = outsideRange(field);
    for (const config of [{}, { [field]: below }, { [field]: above }]) {
      const estimate = estimateFromPriceList(
        [
          {
            description: "Guard line",
            category: "EQUIPMENT",
            quantity: safeQuantity(field),
            unit: "unit·day",
            rateField: field,
          },
        ],
        config,
        AU,
      );
      expect(estimate.totals.status).toBe("blocked");
      expectNoRangeFigure(estimate, field);
    }
  });

  it("on a stored equipment line whose rate is not set", () => {
    const fields = equipmentLineBlockedFields({
      total: null,
      rateField: field,
      note: blockedRates({ [field]: null }, [field])[0].note,
    } as Parameters<typeof equipmentLineBlockedFields>[0]);
    expect(fields).toMatchObject({ pricingStatus: "rate_not_set" });
    expectNoRangeFigure(fields, field);
  });

  it("in the price-list validation errors", () => {
    const { below, above } = outsideRange(field);
    for (const value of [below, above]) {
      const service = validatePricingConfig({ [field]: value });
      expect(service.valid).toBe(false);
      expectNoRangeFigure(service, field);

      const violations = validatePricingConfigNRPG({ [field]: value });
      expect(violations).toHaveLength(1);
      expectNoRangeFigure(violations, field);
    }
  });
});

describe("the NIR cost estimate", () => {
  it("answers a blocked estimate with no range figure in the body", async () => {
    const field = "dehumidifierLGRDailyRate";
    const estimate = await estimateCosts(
      [
        {
          id: "s1",
          itemType: "install_dehumidification",
          description: "LGR dehumidifiers",
          quantity: safeQuantity(field),
          unit: "day",
          specification: null,
          justification: null,
        },
      ] as Parameters<typeof estimateCosts>[0],
      null,
      { [field]: null } as Parameters<typeof estimateCosts>[2],
      null,
    );
    if (!isBlockedResult(estimate)) throw new Error("expected a blocked estimate");
    // The engine's own result, and the body the route sends from it.
    expectNoRangeFigure(estimate, field);
    const body = await blockedPricingResponse(
      blockedEstimatePricing(estimate),
    ).json();
    expect(body.blocked.lines[0].pricingStatus).toBe("rate_not_set");
    expectNoRangeFigure(body, field);
  });
});

describe("the fire scope", () => {
  it("shows no range figure on any line of an unpriced scope", () => {
    const items = generateFireScope({
      smokeType: "protein",
      charLevel: 1,
      affectedAreaM2: 113,
      pricingConfig: {},
    });
    const ranged = items.filter(
      (i) => i.rateField && NRPG_RATE_RANGES[i.rateField] && i.pricingNote,
    );
    // Fire lines that read a ranged field exist, so this checks something.
    expect(ranged.length).toBeGreaterThan(0);
    for (const item of ranged) {
      expectNoRangeFigure(item.pricingNote, item.rateField!);
    }
  });
});

// ─── Source scans ────────────────────────────────────────────────────────────

const ROOT = resolve(__dirname, "../..");
const RANGE_FILE = "lib/nrpg-rate-ranges.ts";
const SOURCE_DIRS = ["app", "components", "lib"];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith("."))
      continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name))
      out.push(path);
  }
  return out;
}

/** The modules a file loads at run time (type-only imports are erased). */
function runtimeImports(source: string): string[] {
  const found: string[] = [];
  const statement =
    /(?:^|\n)\s*(?:import|export)\s+(?!type\b)(?:[^"';]*?\sfrom\s*)?["']([^"']+)["']/g;
  const dynamic = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
  for (const pattern of [statement, dynamic]) {
    for (const match of source.matchAll(pattern)) found.push(match[1]);
  }
  return found;
}

function resolveImport(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/")
    ? join(ROOT, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(from), specifier)
      : null;
  if (!base) return null;
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const ALL_SOURCES = SOURCE_DIRS.flatMap((d) => sourceFiles(join(ROOT, d)));
const rel = (path: string) => relative(ROOT, path).replace(/\\/g, "/");

describe("who may read the range file", () => {
  /**
   * Each of these reads the ranges to check a value or a unit, and its
   * output is held by the figure checks above. NRPG's own platform-admin
   * views (app/api/admin/**) are out of scope for RA-8281 step 1. A new
   * reader must be added here on purpose, with its output checked.
   */
  const ALLOWED_READERS = [
    "app/api/pricing-config/route.ts",
    "lib/assessments/price-list-estimate.ts",
    "lib/billing/company-pricing-service.ts",
    "lib/billing/rate-engine.ts",
    "lib/nir-cost-estimation.ts",
    "lib/scope-fire.ts",
  ];

  it("only the named validators import lib/nrpg-rate-ranges.ts", () => {
    const readers = ALL_SOURCES.filter(
      (file) =>
        rel(file) !== RANGE_FILE &&
        !rel(file).startsWith("app/api/admin/") &&
        runtimeImports(readFileSync(file, "utf8")).some(
          (spec) => rel(resolveImport(file, spec) ?? "") === RANGE_FILE,
        ),
    ).map(rel);
    expect(readers.sort()).toEqual(ALLOWED_READERS);
  });

  it("no file the browser loads reaches the range file", () => {
    // Every "use client" file, and everything it loads at run time, is sent
    // to the browser. If the range file is in that set, the figures are
    // readable in the page's scripts even when no screen prints them.
    const clientRoots = ALL_SOURCES.filter((file) =>
      /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(
        readFileSync(file, "utf8"),
      ),
    );
    expect(clientRoots.length).toBeGreaterThan(100);

    const cameFrom = new Map<string, string | null>();
    const queue: string[] = [];
    for (const root of clientRoots) {
      cameFrom.set(root, null);
      queue.push(root);
    }
    while (queue.length > 0) {
      const file = queue.pop()!;
      for (const spec of runtimeImports(readFileSync(file, "utf8"))) {
        const target = resolveImport(file, spec);
        if (target && !cameFrom.has(target)) {
          cameFrom.set(target, file);
          queue.push(target);
        }
      }
    }

    const rangeFile = join(ROOT, RANGE_FILE);
    const path: string[] = [];
    for (
      let at: string | null | undefined = cameFrom.has(rangeFile)
        ? rangeFile
        : undefined;
      at;
      at = cameFrom.get(at)
    ) {
      path.unshift(rel(at));
    }
    expect(path, `the browser loads the range file via: ${path.join(" -> ")}`).toEqual([]);
  });

  it("the settings screen's rate names match the recorded labels", () => {
    // BASE_RATE_LABELS exists so the settings screen does not import the
    // range file. This keeps the two sets of names from drifting apart.
    expect(Object.keys(BASE_RATE_LABELS).sort()).toEqual(
      [...BASE_RATE_FIELDS].sort(),
    );
    for (const field of BASE_RATE_FIELDS) {
      expect(BASE_RATE_LABELS[field]).toBe(NRPG_RATE_RANGES[field].label);
    }
  });
});
