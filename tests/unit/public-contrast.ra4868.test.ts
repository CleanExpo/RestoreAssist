import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { contrast, hexToRgb, over, resolve } from "./support/wcag-contrast";
import { colourLiterals, scanSource } from "./support/jsx-surface-contrast";

/**
 * RA-4868. axe-core flagged WCAG 1.4.3 colour-contrast failures on /, /pricing
 * and /privacy (40, 11 and 4 nodes at 1440 wide on main faeab74eb). Three kinds
 * of text sat below 4.5:1 in light mode:
 *   K1  text-slate-500 on the #F0F3F6 / #F3F5F7 canvas, 4.27 to 4.35:1;
 *   K2  small text-slate-400 labels, 2.3:1 on the canvas;
 *   K3  text-white/40 and /45 on the brand-navy band, 3.8 and 4.48:1.
 * The rule for these pages: muted text is slate-600 (or brand-slate), and
 * white text on the navy band is at least 60% opaque.
 *
 * RA-8549. This guard used to measure a text colour against brand-navy if the
 * colour was on a fixed list of "navy-band" colours, and against #F0F3F6
 * otherwise, so a listed colour on a light surface passed unmeasured. It now
 * reads the surface from the JSX tree (support/jsx-surface-contrast.ts): the
 * nearest solid `bg-` on the element or an ancestor, translucent fills
 * composited, with axe's 3:1 threshold for large text. The two K4 decorative
 * numerals it used to excuse (ClaimFolioLanding, brand-harbour/20 and /35) are
 * fixed and no longer excused. Its limits are listed in that file.
 */

const ROOT = process.cwd();
const AA = 4.5;

const SOURCES = [
  "components/landing/home",
  "components/landing/concepts/claim-folio",
  "components/pricing",
  "app/pricing",
  "app/privacy",
];

/** Darkest light surface on the public pages: the home canvas in HomePage. */
const LIGHT_SURFACE = hexToRgb("#F0F3F6");
const DARK_SURFACE = resolve("brand-navy");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "__tests__" ? [] : walk(p);
    return /\.tsx$/.test(p) && !/\.test\.tsx$/.test(p) ? [p] : [];
  });
}

/** Resolve `./motion` and `@/components/...` so imported class constants are measured. */
function readImport(rel: string, spec: string) {
  const base = spec.startsWith("@/")
    ? join(ROOT, spec.slice(2))
    : spec.startsWith(".")
      ? join(ROOT, dirname(rel), spec)
      : null;
  if (!base) return null;
  for (const p of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (existsSync(p))
      return { rel: relative(ROOT, p), src: readFileSync(p, "utf8") };
  }
  return null;
}

const FILES = SOURCES.flatMap((d) => walk(join(ROOT, d)));

function scanAll() {
  return FILES.map((file) =>
    scanSource(readFileSync(file, "utf8"), relative(ROOT, file), {
      readImport,
    }),
  );
}

describe("RA-4868 public landing, pricing and privacy text meets WCAG AA", () => {
  it("measures the pairs axe measured in the browser", () => {
    // axe-core 4.10.2 on main faeab74eb reported these exact ratios.
    expect(contrast(resolve("slate-500"), LIGHT_SURFACE)).toBeCloseTo(4.27, 1);
    // axe prints this one to one decimal place ("2.3"); the exact value is 2.36.
    expect(contrast(resolve("slate-400"), LIGHT_SURFACE)).toBeCloseTo(2.36, 1);
    expect(
      contrast(over([1, 1, 1], 0.45, DARK_SURFACE), DARK_SURFACE),
    ).toBeCloseTo(4.48, 1);
    expect(contrast(resolve("slate-600"), LIGHT_SURFACE)).toBeGreaterThan(AA);
  });

  it("finds class strings to check", () => {
    expect(FILES.length).toBeGreaterThan(20);
    const measured = scanAll().reduce((n, r) => n + r.measured, 0);
    expect(measured).toBeGreaterThan(300);
  });

  it("no text colour is below WCAG AA against the surface it sits on", () => {
    const failures = scanAll()
      .flatMap((r) => r.findings)
      .map(
        (f) =>
          `${f.key.split("|")[0]}:${f.line}  ${f.cls} on ${f.surface}  ${f.ratio.toFixed(2)}:1 < ${f.required}:1`,
      );
    expect(failures).toEqual([]);
  });

  it("measures every class string that holds a text colour", () => {
    // A string the tree walk never places on a surface would pass unmeasured;
    // this keeps the guard from going quiet on a pattern it cannot read.
    const used = new Set(scanAll().flatMap((r) => [...r.used]));
    const unplaced = FILES.flatMap((file) => {
      const rel = relative(ROOT, file);
      return colourLiterals(readFileSync(file, "utf8"), rel)
        .filter((l) => !used.has(l.id))
        .map((l) => `${rel}:${l.line}  ${l.text}`);
    });
    expect(unplaced).toEqual([]);
  });
});
