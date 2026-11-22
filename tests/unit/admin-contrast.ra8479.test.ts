import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { contrast, isColour, overWhite, resolve } from "./support/wcag-contrast";

/**
 * RA-8479. The admin pages used saturated 500/600 steps that read the same in
 * both themes. In light mode that put "Admin Only" and "Healthy" badges near
 * 2.9:1 and white-on-500 buttons near 2.5 to 4.2:1, below WCAG AA (4.5:1 for
 * text). The rule in app/globals.css: solid fills with white text use
 * `brand-cta` (or step 600+), and tinted badges use the 700 or 800 text step in
 * light mode with the brighter value behind `dark:`.
 *
 * This test reads every class string under app/dashboard/admin, resolves the
 * colours from Tailwind's theme.css and app/globals.css, and computes the
 * light-mode contrast of three pairs:
 *   1. a tinted badge: `bg-{c}/NN` with an unprefixed `text-{c}` in one string,
 *      measured over white;
 *   2. a solid fill with `text-white` (base and `hover:` fill);
 *   3. coloured text on a <p>, <a>, <span> or <Link> with no fill of its own,
 *      measured on white.
 * Icons (lucide components) are non-text and only need 3:1, so they are not
 * checked here.
 */

const ROOT = process.cwd();
const ADMIN = join(ROOT, "app", "dashboard", "admin");
const AA = 4.5;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return p.endsWith(".tsx") ? [p] : [];
  });
}

interface Finding {
  where: string;
  pair: string;
  ratio: number;
}

function lineOf(src: string, index: number): number {
  return src.slice(0, index).split("\n").length;
}

function scan(): Finding[] {
  const findings: Finding[] = [];
  for (const file of walk(ADMIN)) {
    const src = readFileSync(file, "utf8");
    const rel = relative(ROOT, file);

    // Rules 1 and 2: every string literal that carries classes.
    for (const m of src.matchAll(/"([^"\n]*)"/g)) {
      const classes = m[1].split(/\s+/).filter(Boolean);
      const where = `${rel}:${lineOf(src, m.index!)}`;
      const textColour = classes
        .map((c) => c.match(/^text-([a-z0-9-]+)$/)?.[1])
        .find((c): c is string => !!c && isColour(c));
      if (!textColour) continue;

      for (const cls of classes) {
        const tint = cls.match(/^bg-([a-z0-9-]+)\/(\d+)$/);
        if (tint && isColour(tint[1]) && textColour !== "white") {
          const bg = overWhite(resolve(tint[1]), Number(tint[2]) / 100);
          const ratio = contrast(resolve(textColour), bg);
          if (ratio < AA) findings.push({ where, pair: `text-${textColour} on ${cls}`, ratio });
        }
        const solid = cls.match(/^(hover:)?bg-([a-z0-9-]+)$/);
        if (solid && isColour(solid[2]) && textColour === "white") {
          const ratio = contrast([1, 1, 1], resolve(solid[2]));
          if (ratio < AA) findings.push({ where, pair: `text-white on ${cls}`, ratio });
        }
      }
    }

    // Rule 3: coloured text on a text element with no fill of its own.
    const tag = /<(p|a|span|Link)\s[^>]*?className="([^"]*)"/g;
    for (const m of src.matchAll(tag)) {
      const classes = m[2].split(/\s+/).filter(Boolean);
      if (classes.some((c) => /^bg-/.test(c))) continue;
      for (const cls of classes) {
        const t = cls.match(/^text-([a-z0-9-]+)$/);
        if (!t || !isColour(t[1]) || t[1] === "white") continue;
        const ratio = contrast(resolve(t[1]), [1, 1, 1]);
        if (ratio < AA) {
          findings.push({
            where: `${rel}:${lineOf(src, m.index!)}`,
            pair: `${cls} on white`,
            ratio,
          });
        }
      }
    }
  }
  return findings;
}

describe("RA-8479 admin pages meet WCAG AA in light mode", () => {
  it("resolves colours the way the sweep measured them", () => {
    // Sanity anchors from the RA-8383 sweep and app/globals.css.
    expect(contrast([1, 1, 1], resolve("brand-harbour-500"))).toBeCloseTo(4.19, 1);
    expect(contrast([1, 1, 1], resolve("brand-cta"))).toBeGreaterThan(8.5);
    expect(contrast([1, 1, 1], resolve("emerald-500"))).toBeCloseTo(2.47, 1);
  });

  it("finds class strings to check", () => {
    expect(walk(ADMIN).length).toBeGreaterThan(10);
  });

  it("no badge, button or link pair is below 4.5:1", () => {
    const failures = scan().map(
      (f) => `${f.where}  ${f.pair}  ${f.ratio.toFixed(2)}:1`,
    );
    expect(failures).toEqual([]);
  });
});
