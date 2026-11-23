import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  contrast,
  hexToRgb,
  isColour,
  over,
  resolve,
  type Rgb,
} from "./support/wcag-contrast";

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
 * This test reads every class string in the public landing, pricing and
 * privacy sources and measures each unprefixed `text-{colour}` against the
 * surface it sits on: its own solid `bg-` in the same string when there is
 * one; brand-navy for the colours listed in ON_DARK_BAND, which these pages
 * use only on the navy band; otherwise the darkest light surface these pages
 * use (#F0F3F6). `dark:` and state variants are not measured: the public
 * pages render light whatever the operating system asks for.
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

/** Text colours used only on the navy band (lower case, without alpha). */
const ON_DARK_BAND = new Set([
  "white",
  "[#7ba3bd]",
  "[#8fb2c9]",
  "[#a8c5d8]",
  "brand-gold",
  "brand-gold-hover",
  "brand-harbour-light",
]);

/**
 * Named remainders (RA-4868, K4). Large decorative numerals whose design is a
 * pale tint; making them pass changes the look, which is a design decision.
 * `aria-hidden` does not take them out of axe's color-contrast rule: the 144px
 * numeral already carries it and axe still reports it. Each entry must still
 * exist, so a fixed remainder cannot linger here.
 */
const REMAINDERS = new Set([
  "components/landing/concepts/claim-folio/ClaimFolioLanding.tsx|text-brand-harbour/20",
  "components/landing/concepts/claim-folio/ClaimFolioLanding.tsx|text-brand-harbour/35",
]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "__tests__" ? [] : walk(p);
    return /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p) ? [p] : [];
  });
}

/** `slate-500`, `brand-harbour/35`, `[#7BA3BD]` -> colour and alpha. */
function readColour(
  token: string,
): { name: string; rgb: Rgb; alpha: number } | null {
  const m = token.match(/^(\[#[0-9a-fA-F]{6}\]|[a-z][a-z0-9-]*)(?:\/(\d+))?$/);
  if (!m) return null;
  const name = m[1].toLowerCase();
  const alpha = m[2] ? Number(m[2]) / 100 : 1;
  if (name.startsWith("[")) return { name, rgb: hexToRgb(name.slice(1, -1)), alpha };
  return isColour(name) ? { name, rgb: resolve(name), alpha } : null;
}

interface Finding {
  key: string;
  where: string;
  pair: string;
  ratio: number;
}

function lineOf(src: string, index: number): number {
  return src.slice(0, index).split("\n").length;
}

function scan(): Finding[] {
  const findings: Finding[] = [];
  for (const file of SOURCES.flatMap((d) => walk(join(ROOT, d)))) {
    const src = readFileSync(file, "utf8");
    const rel = relative(ROOT, file);
    for (const m of src.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
      // A template literal can hold quoted class strings in `${...}` branches;
      // trim the quotes and braces so those tokens are measured too.
      const classes = (m[1] ?? m[2] ?? m[3])
        .split(/\s+/)
        .map((c) => c.replace(/^["'`{(]+|["'`})]+$/g, ""))
        .filter(Boolean);
      const fill = classes
        .map((c) => c.match(/^bg-(.+)$/)?.[1])
        .map((c) => (c ? readColour(c) : null))
        .find((c) => c && c.alpha === 1);
      for (const cls of classes) {
        const t = cls.match(/^text-(.+)$/);
        const text = t ? readColour(t[1]) : null;
        if (!text) continue;
        const surface =
          fill?.rgb ?? (ON_DARK_BAND.has(text.name) ? DARK_SURFACE : LIGHT_SURFACE);
        const ratio = contrast(over(text.rgb, text.alpha, surface), surface);
        if (ratio < AA) {
          findings.push({
            key: `${rel}|${cls}`,
            where: `${rel}:${lineOf(src, m.index!)}`,
            pair: cls,
            ratio,
          });
        }
      }
    }
  }
  return findings;
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
    expect(SOURCES.flatMap((d) => walk(join(ROOT, d))).length).toBeGreaterThan(20);
  });

  it("no text colour is below 4.5:1 except the named K4 remainders", () => {
    const failures = scan()
      .filter((f) => !REMAINDERS.has(f.key))
      .map((f) => `${f.where}  ${f.pair}  ${f.ratio.toFixed(2)}:1`);
    expect(failures).toEqual([]);
  });

  it("every named remainder still exists and still fails", () => {
    const keys = new Set(scan().map((f) => f.key));
    expect([...REMAINDERS].filter((k) => !keys.has(k))).toEqual([]);
  });
});
