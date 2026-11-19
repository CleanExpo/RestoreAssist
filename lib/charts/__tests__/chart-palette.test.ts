/**
 * RA-8465: every Recharts chart takes its colours from lib/charts/palette.ts.
 *
 * The charts used to carry their own raw hex arrays (stock Tailwind cyan,
 * amber, violet and so on), so the brand palette never reached them. This guard scans
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

/** Raw colour literals anywhere in an exported value, whether or not it also uses var(). */
export function rawColoursIn(value: unknown): string[] {
  return collectStrings(value).flatMap(findRawColours);
}

describe("lib/charts/palette.ts", () => {
  const values = collectStrings(palette).filter((s) => s.includes("--"));
  const css = readFileSync(join(ROOT, "app", "globals.css"), "utf8");
  const light = declaredIn(css, /^:root\s*\{/m);
  const dark = declaredIn(css, /^\.dark\s*\{/m);

  it("hands out CSS variables only", () => {
    expect(values.length).toBeGreaterThan(0);
    expect(rawColoursIn(palette)).toEqual([]);
  });

  it("catches a raw colour planted in an export that uses no var()", () => {
    // palette.ts imports nothing from recharts, so the chart-file scan never reads it.
    const planted = { ...palette.CHART_TOOLTIP_STYLE, backgroundColor: "#ffffff" };
    expect(rawColoursIn(planted)).toEqual(["#ffffff"]);
    expect(rawColoursIn({ borderRadius: "6px", fontSize: 12 })).toEqual([]);
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

/** Custom property values declared directly inside the first block for a selector. */
function blockValues(css: string, selector: RegExp): Map<string, string> {
  const m = css.match(selector);
  if (!m || m.index === undefined) return new Map();
  const start = css.indexOf("{", m.index);
  const end = css.indexOf("}", start);
  const body = css.slice(start + 1, end);
  return new Map(
    [...body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((x) => [x[1], x[2].trim()]),
  );
}

/** Follow var() references through the brand hex tokens to a hex value. */
function resolveHex(value: string, tokens: Map<string, string>, depth = 0): string | null {
  const v = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  const ref = v.match(/^var\((--[a-z0-9-]+)\)$/);
  if (!ref || depth > 5) return null;
  const next = tokens.get(ref[1]);
  return next === undefined ? null : resolveHex(next, tokens, depth + 1);
}

/** OKLab distance x100, the dataviz skill's normal-vision measure. */
function oklabDeltaE(a: string, b: string): number {
  const lab = (hex: string) => {
    const lin = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    const [r, g, bl] = lin;
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * bl);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * bl);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * bl);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
  };
  const [p, q] = [lab(a), lab(b)];
  return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

describe("chart slots survive a brand palette change", () => {
  const css = readFileSync(join(ROOT, "app", "globals.css"), "utf8");
  // Every hex declaration in the file, so var() chains resolve to their value.
  const tokens = new Map(
    [...css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)]
      .filter((x) => /^#[0-9a-fA-F]{6}$/.test(x[2].trim()))
      .map((x) => [x[1], x[2].trim()] as [string, string]),
  );
  const blocks: Array<[string, Map<string, string>]> = [
    [":root", blockValues(css, /^:root\s*\{/m)],
    [".report-light-surface", blockValues(css, /^\.report-light-surface\s*\{/m)],
    [".dark", blockValues(css, /^\.dark\s*\{/m)],
  ];

  // Slot 1 may follow the brand link colour; slots 2 to 8 must not borrow a brand
  // token, because a palette change re-points those (palette B turned bronze into
  // cobalt, the same blue as slot 1).
  it.each(blocks)("%s: slots 2 to 8 use chart-owned tokens only", (_name, block) => {
    for (let n = 2; n <= 8; n++) {
      expect(block.get(`--chart-${n}`), `--chart-${n}`).toMatch(
        /^var\(--color-brand-chart-[a-z-]+\)$/,
      );
    }
  });

  it.each(blocks)("%s: adjacent slots stay distinct (normal-vision delta E >= 15)", (_name, block) => {
    const hexes = [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
      resolveHex(block.get(`--chart-${n}`) ?? "", tokens),
    );
    hexes.forEach((h, i) => expect(h, `--chart-${i + 1} does not resolve to a hex`).not.toBeNull());
    for (let i = 0; i < 7; i++) {
      const d = oklabDeltaE(hexes[i]!, hexes[i + 1]!);
      expect(d, `--chart-${i + 1} ${hexes[i]} vs --chart-${i + 2} ${hexes[i + 1]}`).toBeGreaterThanOrEqual(15);
    }
  });

  // A custom property's var() resolves where it is declared, so a light island
  // nested under .dark inherits the dark result of every --chart-* alias it does
  // not redeclare, and of every input those aliases read. The island must
  // therefore carry the whole light chart block and its inputs, not a subset.
  it(".report-light-surface redeclares every :root chart variable with the light value", () => {
    const root = blockValues(css, /^:root\s*\{/m);
    const island = blockValues(css, /^\.report-light-surface\s*\{/m);
    const chartVars = [...root.keys()].filter((k) => k.startsWith("--chart-"));
    expect(chartVars.length).toBeGreaterThan(8);
    for (const name of chartVars) expect(island.get(name), name).toBe(root.get(name));
  });

  it(".report-light-surface redeclares every semantic input the chart variables read", () => {
    const root = blockValues(css, /^:root\s*\{/m);
    const island = blockValues(css, /^\.report-light-surface\s*\{/m);
    const inputs = new Set(
      [...root.entries()]
        .filter(([k]) => k.startsWith("--chart-"))
        .flatMap(([, v]) => [...v.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]))
        .filter((n) => !n.startsWith("--color-brand-")),
    );
    expect(inputs.size).toBeGreaterThan(3);
    for (const name of inputs) expect(island.get(name), name).toBe(root.get(name));
  });

  it("the distance measure separates a planted near-duplicate pair", () => {
    // Palette B's link and bronze tokens: the collision this guard exists for.
    expect(oklabDeltaE("#1638c8", "#1d3fc4")).toBeLessThan(15);
    expect(oklabDeltaE("#1638c8", "#a34a06")).toBeGreaterThanOrEqual(15);
  });
});
