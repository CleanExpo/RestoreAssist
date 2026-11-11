/**
 * RA-8281 B1 — a price-list rate the contractor has not set is never priced
 * at $0. Two guards:
 *   1. the helpers throw / report instead of returning a number;
 *   2. no changed reader coerces a rate field to 0 (parsed, not regex-matched).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  BASE_RATE_FIELDS,
  RateNotSetError,
  assertRatesSet,
  requireRate,
  unsetRates,
} from "@/lib/pricing/rate-not-set";
import { getEquipmentDailyRate } from "@/lib/equipment-matrix";
import { estimateCosts } from "@/lib/nir-cost-estimation";

describe("requireRate", () => {
  it("returns a set rate", () => {
    expect(requireRate({ callOutFee: 150 }, "callOutFee")).toBe(150);
  });

  it.each([null, undefined, Number.NaN])(
    "throws RateNotSetError for %s, never 0",
    (v) => {
      expect(() => requireRate({ callOutFee: v }, "callOutFee")).toThrow(
        RateNotSetError,
      );
    },
  );

  it("names the national range when NRPG has one", () => {
    expect(() =>
      requireRate(
        { dehumidifierLGRDailyRate: null },
        "dehumidifierLGRDailyRate",
      ),
    ).toThrow(/Rate not set.*national range \$\d/);
  });

  it("names no range for a field NRPG has no range for", () => {
    try {
      requireRate({ rateFireDebrisRemoval: null }, "rateFireDebrisRemoval");
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toMatch(/Rate not set/);
      expect((e as Error).message).not.toMatch(/national range/);
    }
  });
});

describe("unsetRates / assertRatesSet", () => {
  it("lists every unset field", () => {
    const unset = unsetRates({ callOutFee: 1, administrationFee: null }, [
      "callOutFee",
      "administrationFee",
      "labourerNormalHours",
    ]);
    expect(unset.map((u) => u.field)).toEqual([
      "administrationFee",
      "labourerNormalHours",
    ]);
  });

  it.each([null, undefined])(
    "a missing price list (%s) reports every rate unset instead of crashing",
    (config) => {
      expect(() => assertRatesSet(config, ["callOutFee"])).toThrow(
        RateNotSetError,
      );
      expect(() => requireRate(config, "callOutFee")).toThrow(RateNotSetError);
      expect(unsetRates(config, ["callOutFee"]).map((u) => u.field)).toEqual([
        "callOutFee",
      ]);
    },
  );

  it("assertRatesSet passes a complete list and throws on a gap", () => {
    const full = Object.fromEntries(BASE_RATE_FIELDS.map((f) => [f, 10]));
    expect(() => assertRatesSet(full, BASE_RATE_FIELDS)).not.toThrow();
    expect(() =>
      assertRatesSet({ ...full, callOutFee: null }, BASE_RATE_FIELDS),
    ).toThrow(RateNotSetError);
  });
});

describe("getEquipmentDailyRate", () => {
  it("throws for an unset rate on a price list, never 0", () => {
    expect(() =>
      getEquipmentDailyRate("lgr-85", { dehumidifierLGRDailyRate: null }),
    ).toThrow(RateNotSetError);
  });

  it("control: returns the contractor's own rate", () => {
    expect(
      getEquipmentDailyRate("lgr-85", { dehumidifierLGRDailyRate: 61 }),
    ).toBe(61);
  });
});

describe("NIR estimateCosts", () => {
  const scope = [
    { itemType: "install_dehumidification", description: "LGR", quantity: 2 },
  ];
  const full = Object.fromEntries(BASE_RATE_FIELDS.map((f) => [f, 60]));

  // RA-8281 (B2): the estimate is no longer refused by a throw. The line is
  // blocked and no total is given.
  it("an unset rate on a price list is a blocked line with no total, never a midpoint or $0", async () => {
    const est = await estimateCosts(scope, null, {
      ...full,
      dehumidifierLGRDailyRate: null,
    } as never);
    expect(est.status).toBe("blocked");
    expect(est.items[0]).toMatchObject({
      rate: null,
      subtotal: null,
      rateField: "dehumidifierLGRDailyRate",
    });
    expect(est).toMatchObject({ subtotal: null, contingency: null, total: null });
  });

  it("control: a set rate prices at the contractor's own rate", async () => {
    const est = await estimateCosts(scope, null, full as never);
    expect(est.items[0].rate).toBe(60);
  });

  // RA-8281 (B2) review round 1: blocked lines must not change what a fully
  // priced estimate looks like. Its keys, and its lines' keys, are the ones
  // it had before blocked lines existed: no status, no blocked-line fields.
  it("a fully priced estimate keeps its pre-B2 shape: no status key, no blocked-line fields", async () => {
    const est = await estimateCosts(scope, null, full as never);
    expect(Object.keys(est).sort()).toEqual([
      "breakdown",
      "contingency",
      "contingencyPercentage",
      "currency",
      "items",
      "nrpgCompliant",
      "nrpgViolations",
      "pricingSource",
      "subtotal",
      "total",
    ]);
    for (const item of est.items) {
      for (const key of ["pricingStatus", "rateField", "pricingNote", "nationalRange"]) {
        expect(item).not.toHaveProperty(key);
      }
    }
  });
});

const FIRE_FIELDS = [
  "rateFireRestoration",
  "rateOzoneGenerator",
  "rateHydroxylUnit",
  "rateContentsClean",
  "rateFireEnzymeAdditionalPass",
  "rateFireSolventClean",
  "rateFireDeodorisation",
  "rateFireWallCeilingWash",
  "rateFireWindowTrackClean",
  "rateFireCupboardBenchClean",
  "rateCarpetClean",
  "rateSoftFurnishingClean",
  "rateHvacDuctClean",
  "rateLightFittingClean",
  "rateStructuralAssessment",
  "rateFireDebrisRemoval",
];

/** Readers changed in RA-8281 B1. */
export const RATE_READERS = [
  "lib/nir-cost-estimation.ts",
  "lib/equipment-matrix.ts",
  "lib/billing/rate-engine.ts",
  "lib/pricing/org-pricing.ts",
  "lib/pricing/rate-not-set.ts",
  // RA-8281 B2: the shared blocked-line rule and the screens that show it.
  "lib/pricing/blocked-line.ts",
  "lib/pricing/blocked-line-response.ts",
  "components/pricing/BlockedPricingNotice.tsx",
  "components/CostEstimationViewer.tsx",
  "components/ScopeOfWorksViewer.tsx",
  "app/dashboard/quote/page.tsx",
  "lib/restoration/cost-estimation-builder.ts",
  "lib/restoration/scope-of-works-builder.ts",
  "lib/scope-mould.ts",
  "lib/scope-storm.ts",
  "lib/scope-biohazard.ts",
  "lib/scope-fire.ts",
  "app/api/calculate/route.ts",
  "app/api/inspections/[id]/cost-estimates/route.ts",
  "app/api/inspections/[id]/submit/route.ts",
  "app/api/reports/generate-cost-estimation/route.ts",
  "app/api/reports/generate-scope-of-works/route.ts",
  "components/EquipmentToolsSelection.tsx",
  "components/PricingConfiguration.tsx",
  "components/setup/PricingCard.tsx",
  "lib/pricing/rate-input.ts",
  // RA-8281 B1 class fix: every reader and writer of a stored equipment rate.
  "lib/reports/stored-equipment-pricing.ts",
  "lib/reports/build-structured-report.ts",
  "lib/reports/generate-report-ai.ts",
  "lib/excel-export.ts",
  "app/api/reports/[id]/equipment/route.ts",
  "app/api/reports/[id]/export-excel/route.ts",
  "app/api/reports/generate-inspection-report/route.ts",
  "components/RestorationInspectionReportViewer.tsx",
  "components/VisualDashboardReport.tsx",
  "components/VisualCostEstimationViewer.tsx",
  // RA-8281 B1 round 13: the remaining consumers of a stored selection, now
  // all behind the one reader.
  "app/api/reports/[id]/route.ts",
  "app/api/reports/[id]/pdf/route.ts",
  "app/api/reports/[id]/generate-forensic-pdf/route.ts",
  "app/api/reports/initial-entry/route.ts",
  "app/portal/insurer/[token]/page.tsx",
  "lib/generate-iicrc-report-pdf.ts",
  "lib/restoration/reconcile-pricing-safety.ts",
  "components/InitialDataEntryForm.tsx",
  // Review round 13: every response that answers with a whole Report row.
  "lib/reports/report-equipment-response.ts",
  "app/api/reports/[id]/sections/route.ts",
  "app/api/reports/[id]/duplicate/route.ts",
  "app/api/reports/save-tier-responses/route.ts",
  "app/api/reports/route.ts",
  "app/api/user/export/route.ts",
];

const RATE_NAMES = new Set<string>([
  ...BASE_RATE_FIELDS,
  ...FIRE_FIELDS,
  "dailyRate",
]);
const PRICE_LIST_OBJECTS = new Set([
  "rates",
  "config",
  "pricingConfig",
  "priceList",
]);

/** Strip wrappers that do not change the value: (x), x as T, x!, <T>x, x satisfies T. */
function unwrap(e: ts.Expression): ts.Expression {
  for (;;) {
    if (
      ts.isParenthesizedExpression(e) ||
      ts.isAsExpression(e) ||
      ts.isNonNullExpression(e) ||
      ts.isTypeAssertionExpression(e) ||
      ts.isSatisfiesExpression(e)
    ) {
      e = e.expression;
    } else {
      return e;
    }
  }
}

const NO_VALUE = Symbol("not a constant");
const MATH_FNS = new Set([
  "trunc",
  "floor",
  "ceil",
  "round",
  "abs",
  "min",
  "max",
  "sign",
]);
const NUMBER_FNS: Record<string, (...a: never[]) => unknown> = {
  Number: Number as never,
  parseInt: parseInt as never,
  parseFloat: parseFloat as never,
  String: String as never,
  Boolean: Boolean as never,
  BigInt: BigInt as never,
};

/**
 * The value of an expression built only from literals, operators and pure
 * number functions, or NO_VALUE. Review round 3 showed a literal-only check is
 * evaded by `?? Number(0)`; folding the constant closes the class
 * (`Number(0)`, `1 - 1`, `0 * 5`, `Math.max(0)`, `false`, `"0"`, `void 0`...).
 */
function constantValue(e: ts.Expression): unknown {
  const x = unwrap(e);
  if (ts.isNumericLiteral(x)) return Number(x.text.replace(/_/g, ""));
  if (ts.isBigIntLiteral(x))
    return BigInt(x.text.replace(/n$/, "").replace(/_/g, ""));
  if (ts.isStringLiteralLike(x)) return x.text;
  if (x.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (x.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (x.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isVoidExpression(x)) return undefined;
  if (ts.isPrefixUnaryExpression(x)) {
    const v = constantValue(x.operand) as never;
    if (v === NO_VALUE) return NO_VALUE;
    switch (x.operator) {
      case ts.SyntaxKind.PlusToken:
        return +v;
      case ts.SyntaxKind.MinusToken:
        return -v;
      case ts.SyntaxKind.ExclamationToken:
        return !v;
      case ts.SyntaxKind.TildeToken:
        return ~v;
      default:
        return NO_VALUE;
    }
  }
  if (ts.isBinaryExpression(x)) {
    const a = constantValue(x.left) as never;
    const b = constantValue(x.right) as never;
    if (a === NO_VALUE || b === NO_VALUE) return NO_VALUE;
    try {
      switch (x.operatorToken.kind) {
        case ts.SyntaxKind.PlusToken:
          return (a as number) + (b as number);
        case ts.SyntaxKind.MinusToken:
          return a - b;
        case ts.SyntaxKind.AsteriskToken:
          return a * b;
        case ts.SyntaxKind.SlashToken:
          return a / b;
        case ts.SyntaxKind.PercentToken:
          return a % b;
        case ts.SyntaxKind.BarToken:
          return a | b;
        case ts.SyntaxKind.AmpersandToken:
          return a & b;
        case ts.SyntaxKind.CaretToken:
          return a ^ b;
        case ts.SyntaxKind.BarBarToken:
          return a || b;
        case ts.SyntaxKind.AmpersandAmpersandToken:
          return a && b;
        case ts.SyntaxKind.QuestionQuestionToken:
          return a ?? b;
        default:
          return NO_VALUE;
      }
    } catch {
      return NO_VALUE;
    }
  }
  if (ts.isConditionalExpression(x)) {
    const c = constantValue(x.condition);
    if (c === NO_VALUE) return NO_VALUE;
    return constantValue(c ? x.whenTrue : x.whenFalse);
  }
  if (ts.isCallExpression(x)) {
    const args = x.arguments.map((a) => constantValue(a));
    if (args.some((v) => v === NO_VALUE)) return NO_VALUE;
    const callee = unwrap(x.expression);
    let fn: ((...a: never[]) => unknown) | undefined;
    if (ts.isIdentifier(callee)) fn = NUMBER_FNS[callee.text];
    if (
      ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.expression) &&
      ((callee.expression.text === "Math" && MATH_FNS.has(callee.name.text)) ||
        (callee.expression.text === "Number" &&
          ["parseInt", "parseFloat"].includes(callee.name.text)))
    ) {
      const host = callee.expression.text === "Math" ? Math : Number;
      fn = (host as unknown as Record<string, (...a: never[]) => unknown>)[
        callee.name.text
      ];
    }
    if (!fn) return NO_VALUE;
    try {
      return fn(...(args as never[]));
    } catch {
      return NO_VALUE;
    }
  }
  return NO_VALUE;
}

/**
 * A fallback that stands in for an unset rate as 0: any constant (not
 * null/undefined, which keep the rate unset) whose number value is 0.
 */
function isZero(e: ts.Expression): boolean {
  const v = constantValue(e);
  if (v === NO_VALUE || v === null || v === undefined) return false;
  try {
    return Number(v) === 0;
  } catch {
    return false;
  }
}

/** Does this expression read a price-list rate (by field name or by price-list index)? */
function readsRate(node: ts.Node): boolean {
  let hit = false;
  const visit = (n: ts.Node): void => {
    if (hit) return;
    if (ts.isIdentifier(n) && RATE_NAMES.has(n.text)) {
      hit = true;
      return;
    }
    if (ts.isElementAccessExpression(n)) {
      const obj = unwrap(n.expression);
      const arg = unwrap(n.argumentExpression);
      const objName = ts.isIdentifier(obj)
        ? obj.text
        : ts.isPropertyAccessExpression(obj)
          ? obj.name.text
          : "";
      if (
        PRICE_LIST_OBJECTS.has(objName) ||
        (ts.isStringLiteralLike(arg) && RATE_NAMES.has(arg.text))
      ) {
        hit = true;
        return;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return hit;
}

const COALESCE = new Set([
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
]);

/**
 * Parse the source and return the 1-based line of every expression that turns
 * an unset rate into 0. Parsing, not a regex, so parentheses, casts, `!`,
 * line breaks and comments cannot hide a coercion (RA-8281 review rounds 1-2):
 *   - `<rate read> ?? 0`, `|| 0`, `??= 0`, `||= 0`, at any nesting;
 *   - `<rate read> ? x : 0` and `? 0 : x`;
 *   - `Number(<rate read>)` and `+<rate read>` (both turn null into 0).
 */
function zeroCoercions(src: string, file = "probe.ts"): number[] {
  const sf = ts.createSourceFile(
    file,
    src,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const lines: number[] = [];
  const flag = (n: ts.Node) =>
    lines.push(sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1);
  const visit = (n: ts.Node): void => {
    if (
      ts.isBinaryExpression(n) &&
      COALESCE.has(n.operatorToken.kind) &&
      isZero(n.right) &&
      readsRate(n.left)
    ) {
      flag(n);
    } else if (
      ts.isConditionalExpression(n) &&
      (isZero(n.whenTrue) || isZero(n.whenFalse)) &&
      readsRate(n.condition)
    ) {
      flag(n);
    } else if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === "Number" &&
      n.arguments.some((a) => readsRate(a))
    ) {
      flag(n);
    } else if (
      ts.isPrefixUnaryExpression(n) &&
      n.operator === ts.SyntaxKind.PlusToken &&
      readsRate(n.operand)
    ) {
      flag(n);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return lines;
}

/**
 * A cached selection rate preferred over the current price list
 * (`sel.dailyRate || getEquipmentDailyRate(...)`, or `??`) skips the unset-rate
 * check when the contractor later clears that rate (RA-8281 review round 1).
 */
function cachedRateFallbacks(src: string, file = "probe.ts"): number[] {
  const sf = ts.createSourceFile(
    file,
    src,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const lines: number[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isBinaryExpression(n) && COALESCE.has(n.operatorToken.kind)) {
      const left = unwrap(n.left);
      if (
        ts.isPropertyAccessExpression(left) &&
        left.name.text === "dailyRate"
      ) {
        lines.push(sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return lines;
}

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

describe("no changed reader coerces a rate field to 0", () => {
  it.each(RATE_READERS)("%s", (file) => {
    expect(zeroCoercions(read(file), file)).toEqual([]);
  });

  it.each(RATE_READERS)(
    "%s prefers no cached rate over the price list",
    (file) => {
      expect(cachedRateFallbacks(read(file), file)).toEqual([]);
    },
  );

  it("control: planted coercions are caught", () => {
    expect(zeroCoercions("const r = config.callOutFee ?? 0;")).toEqual([1]);
    expect(
      zeroCoercions("const r = pricingConfig.dehumidifierLGRDailyRate || 0;"),
    ).toEqual([1]);
    expect(zeroCoercions("const r = rates[config.nrpgField] ?? 0;")).toEqual([
      1,
    ]);
    expect(zeroCoercions('const r = cfg["callOutFee"] ?? 0;')).toEqual([1]);
    expect(zeroCoercions("const r = ((rates.callOutFee)) ?? 0;")).toEqual([1]);
    expect(
      zeroCoercions("const r = (rates.callOutFee as number | null) ?? 0;"),
    ).toEqual([1]);
    expect(zeroCoercions("const r = rates.callOutFee! || (0);")).toEqual([1]);
    expect(
      zeroCoercions("const r = rates.callOutFee ?? /* none */ 0;"),
    ).toEqual([1]);
    expect(zeroCoercions("rates.callOutFee ??= 0;")).toEqual([1]);
    expect(
      zeroCoercions("const r = rates.callOutFee ?? (0 as number);"),
    ).toEqual([1]);
    expect(zeroCoercions("const r = (rates as any)[field] ?? 0;")).toEqual([1]);
    // Review round 3: a zero that is not a bare literal.
    for (const zero of [
      "Number(0)",
      "1 - 1",
      "0 * 5",
      "Math.max(0, -1)",
      "false",
      '"0"',
      'parseInt("0")',
      "(0n)",
      "-0",
    ]) {
      expect(
        zeroCoercions(`const r = rates.masterQualifiedNormalHours ?? ${zero};`),
      ).toEqual([1]);
    }
    expect(
      zeroCoercions("const r = rates.callOutFee == null ? 0 : 1;"),
    ).toEqual([1]);
    expect(zeroCoercions("const r = Number(rates.callOutFee);")).toEqual([1]);
    expect(zeroCoercions("const r = +rates.callOutFee;")).toEqual([1]);
  });

  it("control: a non-zero fallback and an unrelated field are not flagged", () => {
    expect(zeroCoercions("const x = callOutFee ?? 0.5;")).toEqual([]);
    expect(zeroCoercions("const x = callOutFee ?? null;")).toEqual([]);
    expect(zeroCoercions("const x = callOutFee ?? undefined;")).toEqual([]);
    expect(zeroCoercions("const x = callOutFee ?? Number(other);")).toEqual([]);
    expect(zeroCoercions("const x = report.total ?? 0;")).toEqual([]);
  });

  it("control: a coercion split across a line break is caught, on its line", () => {
    const src = "const a = 1;\nconst probe = rates.callOutFee\n  ?? 0;\n";
    expect(zeroCoercions(src)).toEqual([2]);
  });

  it("control: the exact review round 2 mutation, planted in the real org-pricing reader, is caught", () => {
    const file = "lib/pricing/org-pricing.ts";
    const src = read(file);
    expect(src).toContain("rate(rates.callOutFee)");
    const planted = src.replace(
      "rate(rates.callOutFee)",
      "rate(((rates.callOutFee)) ?? 0)",
    );
    expect(zeroCoercions(planted, file)).toHaveLength(1);
  });

  it("control: the exact review round 3 mutation, planted in the real org-pricing reader, is caught", () => {
    const file = "lib/pricing/org-pricing.ts";
    const src = read(file);
    expect(src).toContain("rate(rates.masterQualifiedNormalHours)");
    const planted = src.replace(
      "rate(rates.masterQualifiedNormalHours)",
      "rate(rates.masterQualifiedNormalHours ?? Number(0))",
    );
    expect(zeroCoercions(planted, file)).toHaveLength(1);
  });

  it("control: a cached rate fallback is caught, split, parenthesised or with ??", () => {
    expect(cachedRateFallbacks("x = sel.dailyRate || get(id, cfg);")).toEqual([
      1,
    ]);
    expect(
      cachedRateFallbacks("x =\n  sel.dailyRate\n  || get(id, cfg);"),
    ).toEqual([2]);
    expect(
      cachedRateFallbacks("x = (sel.dailyRate!) ?? get(id, cfg);"),
    ).toEqual([1]);
  });
});

describe("price-list screen inputs (RA-8281 B1)", () => {
  it("a blank or non-numeric rate input stays unset, never 0", async () => {
    const { parseRateInput } = await import("@/lib/pricing/rate-input");
    expect(parseRateInput("")).toBeNull();
    expect(parseRateInput("   ")).toBeNull();
    expect(parseRateInput("abc")).toBeNull();
    expect(parseRateInput("-5")).toBeNull();
  });

  it("control: a typed rate is kept, including a deliberate 0 (a waived fee)", async () => {
    const { parseRateInput } = await import("@/lib/pricing/rate-input");
    expect(parseRateInput("61.5")).toBe(61.5);
    expect(parseRateInput("0")).toBe(0);
  });

  it("an unset rate renders as an empty input, not 0", async () => {
    const { rateInputValue } = await import("@/lib/pricing/rate-input");
    expect(rateInputValue(null)).toBe("");
    expect(rateInputValue(undefined)).toBe("");
    expect(rateInputValue(61)).toBe(61);
  });

  const screen = readFileSync(
    join(process.cwd(), "components/PricingConfiguration.tsx"),
    "utf8",
  );

  it("every rate input on the price-list screen renders through rateInputValue", () => {
    const raw = screen.match(/value=\{formData\.\w+\}/g) ?? [];
    expect(raw).toEqual([]);
    expect(screen).toMatch(/value=\{rateInputValue\(formData\.\w+\)\}/);
  });

  it("typing into a rate input parses through parseRateInput, not parseFloat || 0", () => {
    const handler = screen.slice(
      screen.indexOf("const handleInputChange"),
      screen.indexOf("const renderCustomFields"),
    );
    expect(handler).toContain("parseRateInput(");
    expect(handler).not.toMatch(/\|\|\s*0/);
  });

  it("the setup card does not save a blank rate as 0", () => {
    const card = readFileSync(
      join(process.cwd(), "components/setup/PricingCard.tsx"),
      "utf8",
    );
    const blur = card.slice(
      card.indexOf("const handleBlur"),
      card.indexOf("const rows"),
    );
    expect(blur).toContain("parseRateInput(");
    expect(blur).not.toMatch(/Number\(raw\)/);
  });
});

describe("each changed reader blocks an unset rate (RA-8281 B1)", () => {
  const FULL = Object.fromEntries(BASE_RATE_FIELDS.map((f) => [f, 70]));

  it("Margot's price block says 'not set' for an unset rate, never a figure", async () => {
    const { formatOrgPricingBlock } = await import("@/lib/pricing/org-pricing");
    const block = formatOrgPricingBlock({
      ...FULL,
      callOutFee: null,
      negativeAirMachineDailyRate: null,
      hepaVacuumDailyRate: null,
      mobilisationFee: null,
      afterHoursMultiplier: 1.5,
      saturdayMultiplier: 1.5,
      sundayMultiplier: 2,
      publicHolidayMultiplier: 2.5,
    } as never);
    expect(block).toContain(
      "call-out not set (do not quote a figure for this)",
    );
    expect(block).toContain("administration 70");
  });

  /** Every base rate Margot's price block renders through rate(). */
  const MARGOT_RATES = [
    "labourerNormalHours",
    "qualifiedTechnicianNormalHours",
    "masterQualifiedNormalHours",
    "airMoverAxialDailyRate",
    "airMoverCentrifugalDailyRate",
    "dehumidifierLGRDailyRate",
    "dehumidifierDesiccantDailyRate",
    "afdUnitLargeDailyRate",
    "administrationFee",
    "callOutFee",
    "thermalCameraUseCostPerAssessment",
  ];
  const NOT_SET = "not set (do not quote a figure for this)";
  const margotRates = (overrides: Record<string, number | null>) => ({
    ...FULL,
    negativeAirMachineDailyRate: null,
    hepaVacuumDailyRate: null,
    mobilisationFee: null,
    afterHoursMultiplier: 1.5,
    saturdayMultiplier: 1.5,
    sundayMultiplier: 2,
    publicHolidayMultiplier: 2.5,
    ...overrides,
  });

  it("control: Margot's swept rates are real price-list fields, and a full price list shows no 'not set'", async () => {
    const { formatOrgPricingBlock } = await import("@/lib/pricing/org-pricing");
    for (const f of MARGOT_RATES) expect(BASE_RATE_FIELDS).toContain(f);
    const src = read("lib/pricing/org-pricing.ts");
    const rendered = [...src.matchAll(/rate\(rates\.(\w+)\)/g)].map(
      (m) => m[1],
    );
    expect([...rendered].sort()).toEqual([...MARGOT_RATES].sort());
    expect(formatOrgPricingBlock(margotRates({}) as never)).not.toContain(
      NOT_SET,
    );
  });

  it.each(MARGOT_RATES)(
    "Margot's price block says 'not set' for an unset %s, never 0 or another figure",
    async (field) => {
      const { formatOrgPricingBlock } =
        await import("@/lib/pricing/org-pricing");
      const full = formatOrgPricingBlock(margotRates({}) as never);
      const block = formatOrgPricingBlock(
        margotRates({ [field]: null }) as never,
      );
      expect(block.split(NOT_SET)).toHaveLength(2);
      // Exactly one figure left the block: the unset one became "not set".
      const figures = (t: string) => (t.match(/\b70\b/g) ?? []).length;
      expect(figures(block)).toBe(figures(full) - 1);
      expect(block).not.toMatch(/\$?\b0(?:\.00)?\b(?!\.\d)/);
    },
  );

  it.each(BASE_RATE_FIELDS)(
    "the rate engine refuses an unset %s",
    async (field) => {
      const { lookupRate } = await import("@/lib/billing/rate-engine");
      const prisma = {
        user: { findUnique: async () => ({ organizationId: "org_1" }) },
        organizationPricingConfig: {
          findUnique: async () => ({ ...FULL, [field]: null }),
        },
      };
      await expect(
        lookupRate(prisma as never, { userId: "u_1", field }),
      ).rejects.toBeInstanceOf(RateNotSetError);
    },
  );

  it("the rate engine throws for an unset price-list rate instead of falling back", async () => {
    const { lookupRate } = await import("@/lib/billing/rate-engine");
    const prisma = {
      user: { findUnique: async () => ({ organizationId: "org_1" }) },
      organizationPricingConfig: {
        findUnique: async () => ({ ...FULL, callOutFee: null }),
      },
    };
    await expect(
      lookupRate(prisma as never, { userId: "u_1", field: "callOutFee" }),
    ).rejects.toBeInstanceOf(RateNotSetError);
    const ok = await lookupRate(prisma as never, {
      userId: "u_1",
      field: "administrationFee",
    });
    expect(ok?.value).toBe(70);
  });

  // RA-8281 (B2): the builders no longer refuse by a throw. The document
  // comes back blocked: the line has no amount and there is no total.
  it("the cost-estimation report builder blocks an unset rate", async () => {
    const { buildCostEstimationData, COST_ESTIMATION_RATE_FIELDS } =
      await import("@/lib/restoration/cost-estimation-builder");
    const { getGstTreatment } = await import("@/lib/gst-rules");
    const pricingConfig = Object.fromEntries(
      COST_ESTIMATION_RATE_FIELDS.map((f) => [f, 70]),
    );
    pricingConfig.administrationFee = null as never;
    const data: any = buildCostEstimationData({
      report: { id: "r", reportNumber: "RA-1", inspection: null },
      analysis: null,
      tier1: null,
      tier2: null,
      tier3: null,
      pricingConfig,
      stateInfo: null,
      scopeData: null,
      gstTreatment: getGstTreatment("AU"),
    });
    expectBlockedOn(data.blockedPricing, "administrationFee");
    expect(data.totals.subtotal).toBeNull();
    expect(data.totals.totalIncGST).toBeNull();
  });

  it("the scope-of-works report builder blocks an unset rate", async () => {
    const { buildScopeOfWorksData, SCOPE_OF_WORKS_RATE_FIELDS } =
      await import("@/lib/restoration/scope-of-works-builder");
    const pricingConfig = Object.fromEntries(
      SCOPE_OF_WORKS_RATE_FIELDS.map((f) => [f, 70]),
    );
    pricingConfig.administrationFee = null as never;
    const data: any = buildScopeOfWorksData({
      report: { id: "r", reportNumber: "RA-1", inspection: null },
      analysis: null,
      tier1: null,
      tier2: null,
      tier3: null,
      pricingConfig,
      stateInfo: null,
    });
    expectBlockedOn(data.blockedPricing, "administrationFee");
  });

  it("the equipment screen reads an unset rate as null, a set one as itself", async () => {
    const { getEquipmentDailyRateOrNull } =
      await import("@/lib/equipment-matrix");
    expect(
      getEquipmentDailyRateOrNull("lgr-85", { dehumidifierLGRDailyRate: null }),
    ).toBeNull();
    expect(
      getEquipmentDailyRateOrNull("lgr-85", { dehumidifierLGRDailyRate: 61 }),
    ).toBe(61);
  });
});

describe("a cached equipment rate never bypasses the current price list (RA-8281 review)", () => {
  const LGR = [{ groupId: "lgr-85", quantity: 1, dailyRate: 61 }];

  it("totals refuse a selection whose price-list rate is now unset", async () => {
    const { calculateTotalDailyCost } = await import("@/lib/reports/stored-equipment-pricing");
    expect(() =>
      calculateTotalDailyCost(LGR, { dehumidifierLGRDailyRate: null }),
    ).toThrow(RateNotSetError);
  });

  it("totals price at the current price-list rate, not the cached one", async () => {
    const { calculateTotalDailyCost } = await import("@/lib/reports/stored-equipment-pricing");
    expect(calculateTotalDailyCost(LGR, { dehumidifierLGRDailyRate: 70 })).toBe(
      70,
    );
  });

  it("control: a deliberate current 0 stays a set rate", async () => {
    const { calculateTotalDailyCost } = await import("@/lib/reports/stored-equipment-pricing");
    expect(calculateTotalDailyCost(LGR, { dehumidifierLGRDailyRate: 0 })).toBe(
      0,
    );
  });

  it("the cost report blocks cached equipment whose rate is now unset", async () => {
    const { buildCostEstimationData, COST_ESTIMATION_RATE_FIELDS } =
      await import("@/lib/restoration/cost-estimation-builder");
    const { getGstTreatment } = await import("@/lib/gst-rules");
    const pricingConfig: Record<string, number | null> = Object.fromEntries(
      COST_ESTIMATION_RATE_FIELDS.map((f) => [f, 70]),
    );
    pricingConfig.dehumidifierLGRDailyRate = null;
    const data: any = buildCostEstimationData({
      report: { id: "r", reportNumber: "RA-1", inspection: null },
      analysis: null,
      tier1: null,
      tier2: null,
      tier3: null,
      pricingConfig,
      stateInfo: null,
      scopeData: null,
      equipmentSelection: LGR,
      gstTreatment: getGstTreatment("AU"),
    });
    expectBlockedOn(data.blockedPricing, "dehumidifierLGRDailyRate");
  });

  it("the scope of works blocks cached equipment whose rate is now unset", async () => {
    const { buildScopeOfWorksData, SCOPE_OF_WORKS_RATE_FIELDS } =
      await import("@/lib/restoration/scope-of-works-builder");
    const pricingConfig: Record<string, number | null> = Object.fromEntries(
      SCOPE_OF_WORKS_RATE_FIELDS.map((f) => [f, 70]),
    );
    // Desiccant is not in SCOPE_OF_WORKS_RATE_FIELDS, so only the equipment
    // path can catch it.
    pricingConfig.dehumidifierDesiccantDailyRate = null;
    const data: any = buildScopeOfWorksData({
      report: { id: "r", reportNumber: "RA-1", inspection: null },
      analysis: null,
      tier1: null,
      tier2: null,
      tier3: null,
      pricingConfig,
      stateInfo: null,
      equipmentSelection: [
        { groupId: "desiccant-20", quantity: 1, dailyRate: 61 },
      ],
    });
    expectBlockedOn(data.blockedPricing, "dehumidifierDesiccantDailyRate");
  });
});

/**
 * RA-8281 (B2): a blocked document. The unset field is named, at least one
 * line is blocked with no rate and no amount, no blocked line carries a
 * number, and there is no total.
 */
function expectBlockedOn(blocked: any, field: string) {
  expect(blocked).toMatchObject({ status: "blocked", total: null });
  expect(blocked.missing.map((m: { field: string }) => m.field)).toContain(
    field,
  );
  const lines = blocked.lines.filter(
    (l: { pricingStatus: string }) => l.pricingStatus !== "priced",
  );
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) expect(line.subtotal).toBeNull();
}

// RA-8281 B1 review (CodeRabbit on #2533): with no price list loaded (still
// loading, or the fetch failed) and no cached rate, the equipment rate fell
// through to `return 0` after a console.warn, so the screen showed $0.00 and
// a save could send equipmentCostTotal 0. No price list means the rate is unset.
describe("no price list loaded never prices equipment at $0 (RA-8281 B1 review)", () => {
  it("getEquipmentDailyRate with no price list throws RateNotSetError", () => {
    expect(() => getEquipmentDailyRate("lgr-85", undefined)).toThrow(RateNotSetError);
    expect(() => getEquipmentDailyRate("lgr-85", null)).toThrow(RateNotSetError);
  });

  it("an unknown group with a price list is unset, not $0", () => {
    expect(() =>
      getEquipmentDailyRate("no-such-group", { dehumidifierLGRDailyRate: 61 }),
    ).toThrow(RateNotSetError);
  });

  it("a selection with no price list and no cached rate is unset; the screen reads null", async () => {
    const { selectionDailyRate, selectionDailyRateOrNull, getEquipmentDailyRateOrNull } =
      await import("@/lib/equipment-matrix");
    expect(() => selectionDailyRate({ groupId: "lgr-85", dailyRate: undefined })).toThrow(
      RateNotSetError,
    );
    expect(selectionDailyRateOrNull({ groupId: "lgr-85", dailyRate: undefined })).toBeNull();
    expect(getEquipmentDailyRateOrNull("lgr-85", undefined)).toBeNull();
  });

  // Round 8: a cached rate, including a 0 the screen stored while the price
  // list was missing, never stands in for a price list that is not loaded.
  it("a cached rate (61 or 0) with no price list is unset, not used", async () => {
    const { selectionDailyRate } = await import("@/lib/equipment-matrix");
    const { calculateTotalDailyCost } = await import("@/lib/reports/stored-equipment-pricing");
    expect(() => selectionDailyRate({ groupId: "lgr-85", dailyRate: 61 })).toThrow(RateNotSetError);
    expect(() => selectionDailyRate({ groupId: "lgr-85", dailyRate: 0 }, null)).toThrow(RateNotSetError);
    expect(() =>
      calculateTotalDailyCost([{ groupId: "lgr-85", quantity: 2, dailyRate: 0 }], undefined),
    ).toThrow(RateNotSetError);
  });

  // Round 13 review 6: this was a control asserting the cached 61 was used.
  // No catalogue group lacks a price-list field, so that path only ever priced
  // ids outside the catalogue from a posted or stored figure. It is refused.
  it("an id with no price-list field is unset; its cached rate is never used", async () => {
    const { selectionDailyRate } = await import("@/lib/equipment-matrix");
    expect(() => selectionDailyRate({ groupId: "no-such-group", dailyRate: 61 })).toThrow(RateNotSetError);
    expect(() => selectionDailyRate({ groupId: "no-such-group", dailyRate: 61 }, {})).toThrow(RateNotSetError);
  });
});
