/**
 * RA-8465: every Recharts chart takes its colours from lib/charts/palette.ts.
 *
 * The charts used to carry their own raw hex arrays (stock Tailwind cyan,
 * amber, violet and so on), so palette A never reached them. This guard scans
 * every file that imports recharts for a raw colour literal, and checks that
 * the palette module only hands out CSS variables that app/globals.css
 * declares for both light and dark mode, so a chart line can never resolve to
 * nothing and vanish.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import * as palette from "../palette";

const ROOT = join(__dirname, "..", "..", "..");
const SCAN_DIRS = ["app", "components", "lib"];

/**
 * Selector strings in the shadcn chart wrapper that match Recharts' own
 * default attribute values so they can be restyled. They are not colours we
 * paint with. Allowed by exact text, not by file.
 */
const ALLOWED_LITERALS = ["[stroke='#ccc']", "[stroke='#fff']"];

const RAW_COLOUR =
  /(?<!url\()#[0-9a-fA-F]{8}\b|(?<!url\()#[0-9a-fA-F]{6}\b|(?<!url\()#[0-9a-fA-F]{3,4}\b|\b(?:rgba?|hsla?|oklch|oklab)\(/g;

/** Raw colour literals in a source text, after removing allowed selectors. */
export function findRawColours(source: string): string[] {
  let text = source;
  for (const allowed of ALLOWED_LITERALS) text = text.split(allowed).join("");
  return [...text.matchAll(RAW_COLOUR)].map((m) => m[0]);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "__tests__") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function chartFiles(): string[] {
  return SCAN_DIRS.flatMap((d) => walk(join(ROOT, d))).filter((f) =>
    /from\s+["']recharts["']/.test(readFileSync(f, "utf8")),
  );
}

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === "object")
    Object.values(value).forEach((v) => collectStrings(v, out));
  return out;
}

/** Custom properties declared directly inside the first block for a selector. */
function declaredIn(css: string, selector: RegExp): Set<string> {
  const m = css.match(selector);
  if (!m || m.index === undefined) return new Set();
  const start = css.indexOf("{", m.index);
  const end = css.indexOf("}", start);
  const body = css.slice(start + 1, end);
  return new Set([...body.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((x) => x[1]));
}

describe("findRawColours detector", () => {
  it("catches a planted raw colour in every form", () => {
    expect(findRawColours('stroke="#06b6d4"')).toEqual(["#06b6d4"]);
    expect(findRawColours("fill='#fff'")).toEqual(["#fff"]);
    expect(findRawColours('stopColor="#06b6d4cc"')).toEqual(["#06b6d4cc"]);
    expect(findRawColours('const C = ["#1C2E47"];')).toEqual(["#1C2E47"]);
    expect(findRawColours('stroke="rgba(148,163,184,0.15)"')).toEqual(["rgba("]);
    expect(findRawColours('backgroundColor: "hsl(var(--card))"')).toEqual(["hsl("]);
    expect(findRawColours("fill: oklch(0.6 0.1 250)")).toEqual(["oklch("]);
  });

  it("ignores gradient references, tokens and the allowed selectors", () => {
    expect(findRawColours('fill="url(#colorRevenue)"')).toEqual([]);
    expect(findRawColours('stroke="var(--chart-1)"')).toEqual([]);
    expect(findRawColours("[&_.recharts-dot[stroke='#fff']]:stroke-transparent")).toEqual([]);
  });
});

describe("chart files carry no raw colour", () => {
  const files = chartFiles();

  it("finds the chart files (the scan is not empty)", () => {
    const rel = files.map((f) => relative(ROOT, f));
    expect(rel).toContain("app/dashboard/analytics/page.tsx");
    expect(rel).toContain("components/inspection/DryingProgressChart.tsx");
    expect(rel).toContain("components/inspection/MoistureTrendChart.tsx");
  });

  it.each(files.map((f) => [relative(ROOT, f), f]))("%s", (_rel, file) => {
    expect(findRawColours(readFileSync(file, "utf8"))).toEqual([]);
  });
});

describe("lib/charts/palette.ts", () => {
  const values = collectStrings(palette).filter((s) => s.includes("--"));
  const css = readFileSync(join(ROOT, "app", "globals.css"), "utf8");
  const light = declaredIn(css, /^:root\s*\{/m);
  const dark = declaredIn(css, /^\.dark\s*\{/m);

  it("hands out CSS variables only", () => {
    expect(values.length).toBeGreaterThan(0);
    for (const v of collectStrings(palette)) {
      if (v.startsWith("var(") || v.includes("var(--"))
        expect(findRawColours(v)).toEqual([]);
    }
  });

  it("has eight categorical slots in fixed order", () => {
    expect(palette.CHART_SERIES).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `var(--chart-${n})`),
    );
  });

  it("folds a ninth series to neutral instead of cycling", () => {
    expect(palette.seriesColour(0)).toBe("var(--chart-1)");
    expect(palette.seriesColour(7)).toBe("var(--chart-8)");
    expect(palette.seriesColour(8)).toBe(palette.CHART_NEUTRAL);
  });

  it("every chart variable is declared for light (:root) and dark (.dark)", () => {
    const names = new Set(
      values.flatMap((v) => [...v.matchAll(/var\((--chart-[a-z0-9-]+)\)/g)].map((m) => m[1])),
    );
    expect(names.size).toBeGreaterThan(8);
    for (const name of names) {
      expect(light.has(name), `${name} missing from :root`).toBe(true);
      expect(dark.has(name), `${name} missing from .dark`).toBe(true);
    }
  });
});
