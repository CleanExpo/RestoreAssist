import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// @ts-expect-error -- plain .mjs helper, no type declarations
import { parseCssTokens } from "../../scripts/lib/check-design-tokens.mjs";

/**
 * RA-8467. .claude/DESIGN.md carries a table of WCAG contrast ratios that
 * designers and agents read before choosing a colour. When the palette moved
 * from A (Harbour) to B (Paper and cobalt) every ratio in that table changed,
 * and nothing tied the figures to the values in app/globals.css. This test
 * recomputes each row from the CSS, so a palette change that leaves the table
 * stale, or a value that drops below its accessibility floor, fails here.
 */

const ROOT = process.cwd();
const css = readFileSync(join(ROOT, "app", "globals.css"), "utf8");
const doc = readFileSync(join(ROOT, ".claude", "DESIGN.md"), "utf8");
const tokens: Map<string, string> = parseCssTokens(css);

function hex(name: string): string {
  if (name === "white") return "#ffffff";
  const value = tokens.get(`--color-${name}`);
  if (!value) throw new Error(`--color-${name} is not declared in globals.css`);
  return value;
}

function luminance(h: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Rows of the "Contrast" table: | Pair | Ratio |. */
function contrastRows(markdown: string): { pair: string; ratio: number }[] {
  const start = markdown.indexOf("### Contrast");
  if (start < 0) throw new Error("DESIGN.md has no Contrast section");
  const section = markdown.slice(start, markdown.indexOf("\n## ", start + 1));
  return section
    .split("\n")
    .filter((l) => /^\|.*\|\s*[\d.]+:1/.test(l))
    .map((l) => {
      const cells = l.split("|").map((c) => c.trim());
      return { pair: cells[1], ratio: Number(cells[2].match(/([\d.]+):1/)![1]) };
    });
}

/** "White on `brand-cta` `#1638c8`" or "`brand-slate` on white" -> [fg, bg]. */
function parsePair(pair: string): [string, string] {
  const side = (s: string) => {
    const tick = s.match(/`(brand-[a-z0-9-]+)`/);
    if (tick) return tick[1];
    if (/white/i.test(s)) return "white";
    throw new Error(`cannot read a colour from "${s}"`);
  };
  const [fg, bg] = pair.split(/\s+on\s+/);
  return [side(fg), side(bg)];
}

describe("DESIGN.md contrast table matches app/globals.css", () => {
  const rows = contrastRows(doc);

  it("has the rows the design rules depend on", () => {
    expect(rows.length).toBeGreaterThanOrEqual(6);
  });

  for (const { pair, ratio } of rows) {
    it(`${pair} is ${ratio}:1`, () => {
      const [fg, bg] = parsePair(pair);
      expect(Math.abs(contrast(hex(fg), hex(bg)) - ratio)).toBeLessThanOrEqual(0.02);
    });
  }

  it("a hex quoted beside a token name is the token's real value", () => {
    for (const { pair } of rows) {
      const m = pair.match(/`(brand-[a-z0-9-]+)`\s+`(#[0-9a-fA-F]{6})`/);
      if (m) expect(m[2].toLowerCase()).toBe(hex(m[1]));
    }
  });
});

describe("brand palette meets its accessibility floors", () => {
  it("white text on the call-to-action fill is AA (4.5:1)", () => {
    expect(contrast("#ffffff", hex("brand-cta"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#ffffff", hex("brand-cta-hover"))).toBeGreaterThanOrEqual(4.5);
  });

  it("muted body copy is AA on white and on the paper surface", () => {
    expect(contrast(hex("brand-slate"), "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hex("brand-slate"), hex("brand-cloud"))).toBeGreaterThanOrEqual(4.5);
  });

  it("headings are AA on paper", () => {
    expect(contrast(hex("brand-navy"), hex("brand-cloud"))).toBeGreaterThanOrEqual(4.5);
  });

  it("dark-mode links are AA on the dark canvas and card", () => {
    expect(contrast(hex("brand-harbour-light"), hex("brand-canvas"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hex("brand-harbour-light"), hex("brand-surface"))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the harbour scale follows the call-to-action hue", () => {
  // The signed-in app's accent is the brand-harbour scale (RA-8464, DSA-04).
  // A palette change that forgets the scale leaves the old hue on hundreds of
  // screens. The interim cyan bridge is gone; no-cyan-utilities.test.ts guards it.
  function oklchHue(h: string): number {
    const lin = [1, 3, 5]
      .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    const [r, g, b] = lin;
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    return ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  }

  it("every brand-harbour step uses the brand-cta hue", () => {
    const want = oklchHue(hex("brand-cta"));
    const scale = [...css.matchAll(/--color-brand-harbour-(\d+):\s*oklch\(([^)]+)\)/g)];
    expect(scale.map(([, step]) => step)).toEqual([
      "50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950",
    ]);
    for (const [, step, body] of scale) {
      const hue = Number(body.trim().split(/\s+/)[2]);
      expect(Math.abs(hue - want), `brand-harbour-${step}`).toBeLessThanOrEqual(0.5);
    }
  });
});
