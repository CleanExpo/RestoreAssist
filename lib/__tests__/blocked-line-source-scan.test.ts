/**
 * RA-8281 (B2): source scan. Every pricing engine shows a blocked line for a
 * price-list rate that is not set; none throws or refuses on its own.
 *
 * The scan walks EVERY non-test .ts/.tsx file under app/, lib/ and
 * components/. It is not a fixed list of files: a new engine or route is
 * covered the day it is written.
 *
 *   Rule A  the throwing helpers (requireRate, assertRatesSet,
 *           assertEquipmentPriced, RateNotSetError) are used only by the
 *           owners named below, each for the stated reason.
 *   Rule B  the "rate not set" HTTP answer is built in one place
 *           (blocked-line-response.ts), and every route that runs a pricing
 *           engine answers a blocked result through it.
 *   Rule C  a file that prices through the shared reader reads no price-list
 *           rate directly (null * n === 0 in JS) and coerces none to a number.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { BASE_RATE_FIELDS } from "@/lib/pricing/rate-not-set";

const ROOT = process.cwd();
const SOURCE_DIRS = ["app", "lib", "components"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) {
      continue;
    }
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) {
      out.push(relative(ROOT, full));
    }
  }
  return out;
}

/** Source with comments removed, so prose about a rule cannot trip it. */
export function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const FILES = SOURCE_DIRS.flatMap((d) => walk(join(ROOT, d)));
const read = (file: string) => code(readFileSync(join(ROOT, file), "utf8"));

/** Rule A: who may use a throwing helper, and why. */
export const THROWING_HELPER_OWNERS: Record<string, string> = {
  "lib/pricing/rate-not-set.ts": "defines the helpers",
  "lib/equipment-matrix.ts":
    "the single equipment rate read; every caller goes through the OrNull readers or the stored-equipment owner, which turn the throw into a blocked line",
  "lib/reports/stored-equipment-pricing.ts":
    "catches the throw and returns a blocked equipment line; assertEquipmentPriced has no production caller",
  "components/EquipmentToolsSelection.tsx":
    "catches the throw and shows 'rate not set' on the editor screen",
  "lib/billing/rate-engine.ts":
    "lookupRate and lookupRates have no caller in app/, lib/ or components/, so there is no line to show (out of scope for B2; named in the PR)",
};

const THROWING_HELPER =
  /\b(requireRate|assertRatesSet|assertEquipmentPriced)\s*\(|\bRateNotSetError\b/;

export function throwingHelperUsers(
  files: readonly string[],
  source: (file: string) => string,
): string[] {
  return files.filter((f) => THROWING_HELPER.test(source(f)));
}

/** Rule B: the engines a route can run, and the one answer for a blocked result. */
const ENGINE_CALL =
  /\b(estimateCosts|buildCostEstimationData|buildScopeOfWorksData|priceListReader)\s*\(/;
const RESPONSE_OWNER = "lib/pricing/blocked-line-response.ts";

/** Routes that run an engine but answer nothing about pricing themselves. */
export const ENGINE_ROUTES_WITHOUT_ANSWER: Record<string, string> = {
  "app/api/inspections/[id]/submit/route.ts":
    "the submit pipeline answers about the submission, not the estimate: a blocked estimate saves nothing and the inspection stays SCOPED; the blocked lines are shown by the cost-estimates route",
};

export function engineRoutesMissingAnswer(
  files: readonly string[],
  source: (file: string) => string,
): string[] {
  return files.filter(
    (f) =>
      /^app\/.*\/route\.ts$/.test(f) &&
      !(f in ENGINE_ROUTES_WITHOUT_ANSWER) &&
      ENGINE_CALL.test(source(f)) &&
      !/\bblockedPricingResponse\s*\(/.test(source(f)),
  );
}

/** Rule C: a direct read of a price-list rate off a config or rates object. */
const DIRECT_RATE_READ = new RegExp(
  `\\b(pricingConfig|config|rates)\\s*(\\?\\.|\\.)\\s*(${BASE_RATE_FIELDS.join("|")})\\b`,
);

export function directRateReads(
  files: readonly string[],
  source: (file: string) => string,
): string[] {
  return files.filter((f) => {
    const src = source(f);
    return (
      /\bpriceListReader\s*\(/.test(src) &&
      f !== "lib/pricing/blocked-line.ts" &&
      (DIRECT_RATE_READ.test(src) || /\bensureNumber\s*\(/.test(src))
    );
  });
}

describe("RA-8281 B2 source scan", () => {
  it("walks the whole source tree (positive control)", () => {
    expect(FILES.length).toBeGreaterThan(1500);
    for (const known of [
      "lib/nir-cost-estimation.ts",
      "app/api/calculate/route.ts",
      "lib/restoration/cost-estimation-builder.ts",
      "lib/restoration/scope-of-works-builder.ts",
      "components/EquipmentToolsSelection.tsx",
    ]) {
      expect(FILES).toContain(known);
    }
  });

  it("Rule A: only the named owners use a throwing rate helper", () => {
    expect(throwingHelperUsers(FILES, read).sort()).toEqual(
      Object.keys(THROWING_HELPER_OWNERS).sort(),
    );
  });

  it("Rule A can fail: a planted throw in an engine is reported", () => {
    const planted = (file: string) =>
      file === "lib/nir-cost-estimation.ts"
        ? `${read(file)}\nconst rate = requireRate(rates, "callOutFee");`
        : read(file);
    expect(throwingHelperUsers(FILES, planted)).toContain(
      "lib/nir-cost-estimation.ts",
    );
    const caught = (file: string) =>
      file === "app/api/calculate/route.ts"
        ? `${read(file)}\nif (err instanceof RateNotSetError) return refuse();`
        : read(file);
    expect(throwingHelperUsers(FILES, caught)).toContain(
      "app/api/calculate/route.ts",
    );
  });

  it("Rule B: the 'rate not set' answer is built in one place", () => {
    const literal = /["'`]RATE_NOT_SET["'`]/;
    expect(FILES.filter((f) => literal.test(read(f)))).toEqual([
      RESPONSE_OWNER,
    ]);
  });

  it("Rule B: every route that runs a pricing engine answers through the shared response", () => {
    expect(engineRoutesMissingAnswer(FILES, read)).toEqual([]);
    // The four engine routes are found by the scan, not listed by hand.
    const answering = FILES.filter(
      (f) =>
        /^app\/.*\/route\.ts$/.test(f) &&
        /\bblockedPricingResponse\s*\(/.test(read(f)),
    );
    expect(answering.sort()).toEqual([
      "app/api/calculate/route.ts",
      "app/api/inspections/[id]/cost-estimates/route.ts",
      "app/api/reports/generate-cost-estimation/route.ts",
      "app/api/reports/generate-scope-of-works/route.ts",
    ]);
  });

  it("Rule B can fail: a route that runs an engine and answers on its own is reported", () => {
    const planted = (file: string) =>
      file === "app/api/reports/generate-cost-estimation/route.ts"
        ? read(file).replace(/blockedPricingResponse\s*\(/g, "ownAnswer(")
        : read(file);
    expect(engineRoutesMissingAnswer(FILES, planted)).toEqual([
      "app/api/reports/generate-cost-estimation/route.ts",
    ]);
    const newRoute = "app/api/new-engine/route.ts";
    expect(
      engineRoutesMissingAnswer([...FILES, newRoute], (file) =>
        file === newRoute
          ? "const estimate = await estimateCosts(items, null, rates, null);"
          : read(file),
      ),
    ).toEqual([newRoute]);
  });

  it("Rule C: an engine on the shared reader reads no rate directly", () => {
    const onReader = FILES.filter((f) => /\bpriceListReader\s*\(/.test(read(f)));
    expect(onReader.sort()).toEqual([
      "app/api/calculate/route.ts",
      "lib/pricing/blocked-line.ts",
      "lib/restoration/cost-estimation-builder.ts",
      "lib/restoration/scope-of-works-builder.ts",
    ]);
    expect(directRateReads(FILES, read)).toEqual([]);
  });

  it("Rule C can fail: a planted direct multiply or coercion is reported", () => {
    const target = "lib/restoration/scope-of-works-builder.ts";
    for (const plant of [
      "const subtotal = 4 * pricingConfig.masterQualifiedNormalHours;",
      "const fee = rates?.callOutFee ?? 0;",
      "const fee = ensureNumber(value);",
    ]) {
      expect(
        directRateReads(FILES, (file) =>
          file === target ? `${read(file)}\n${plant}` : read(file),
        ),
      ).toEqual([target]);
    }
  });

  it("comments do not count as code", () => {
    expect(code("// requireRate(a)\nconst x = 1; /* assertRatesSet( */")).not.toMatch(
      THROWING_HELPER,
    );
    expect(code('const url = "https://x.test/requireRate(";')).toMatch(
      THROWING_HELPER,
    );
  });
});

/**
 * Rule D: a screen that asks an engine route for a price reads the blocked
 * answer and shows it with the one notice. A screen that only reads
 * `error.error` would show a blocked result as a bare error, or as nothing.
 */
const ENGINE_FETCH =
  /fetch\(\s*[`"'][^`"']*(\/api\/calculate\b|\/api\/reports\/generate-cost-estimation\b|\/api\/reports\/generate-scope-of-works\b|\/cost-estimates[`"'])/;

function screensNotShowingBlocked(
  files: readonly string[],
  source: (file: string) => string,
): string[] {
  return files.filter((f) => {
    if (f.startsWith("app/api/")) return false;
    const src = source(f);
    if (!ENGINE_FETCH.test(src)) return false;
    // A GET of saved estimates is not a pricing run; only a POST is.
    if (!/method:\s*["']POST["']/.test(src)) return false;
    return !(
      /\breadBlockedPricing\s*\(/.test(src) && /<BlockedPricingNotice\b/.test(src)
    );
  });
}

describe("RA-8281 B2 Rule D: every screen that runs an engine shows a blocked result", () => {
  it("the screens that call an engine route are the four known ones", () => {
    expect(FILES.filter((f) => !f.startsWith("app/api/") && ENGINE_FETCH.test(read(f))).sort()).toEqual([
      "app/dashboard/inspections/[id]/page.tsx",
      "app/dashboard/quote/page.tsx",
      "components/CostEstimationViewer.tsx",
      "components/ScopeOfWorksViewer.tsx",
    ]);
  });

  it("each of them reads the blocked answer and renders the notice", () => {
    expect(screensNotShowingBlocked(FILES, read)).toEqual([]);
  });

  // The inspection page is too large to render in a unit test, so its
  // handler is held by shape: the blocked answer is read and shown, and the
  // handler returns before it can raise an error or touch the saved estimate.
  const inspectionHandlerHolds = (src: string): boolean => {
    const start = src.indexOf("const handleGenerateCosts = async");
    const body = src.slice(start, src.indexOf("finally", start));
    const read = body.indexOf("const blocked = readBlockedPricing(data);");
    const show = body.indexOf("setBlockedCosts(blocked);");
    const stop = body.indexOf("if (blocked) return;");
    const fail = body.indexOf("if (!res.ok)");
    const save = body.indexOf("setInspection(");
    return (
      start >= 0 && read >= 0 && read < show && show < stop && stop < fail && stop < save
    );
  };

  it("the inspection page shows a blocked estimate before any error or saved-estimate update", () => {
    const src = read("app/dashboard/inspections/[id]/page.tsx");
    expect(inspectionHandlerHolds(src)).toBe(true);
    expect(src).toMatch(/\{blockedCosts && \(/);
    // Can fail: the early return removed, or moved after the error branch.
    expect(inspectionHandlerHolds(src.replace("if (blocked) return;", ""))).toBe(false);
    expect(
      inspectionHandlerHolds(
        src
          .replace("if (blocked) return;", "")
          .replace("setInspection((prev)", "if (blocked) return;\n setInspection((prev)"),
      ),
    ).toBe(false);
  });

  it("Rule D can fail: a screen with the blocked branch removed is reported", () => {
    const target = "components/ScopeOfWorksViewer.tsx";
    expect(
      screensNotShowingBlocked(FILES, (file) =>
        file === target ? read(file).replace(/readBlockedPricing\s*\(/g, "ignore(") : read(file),
      ),
    ).toEqual([target]);
    expect(
      screensNotShowingBlocked(FILES, (file) =>
        file === target ? read(file).replace(/<BlockedPricingNotice\b/g, "<div") : read(file),
      ),
    ).toEqual([target]);
  });
});
