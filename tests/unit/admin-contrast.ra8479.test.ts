import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

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

const themeCss = readFileSync(
  join(ROOT, "node_modules", "tailwindcss", "theme.css"),
  "utf8",
);
const globalsCss = readFileSync(join(ROOT, "app", "globals.css"), "utf8");

const colours = new Map<string, string>();
for (const css of [themeCss, globalsCss]) {
  for (const m of css.matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/g)) {
    if (!colours.has(m[1])) colours.set(m[1], m[2].trim());
  }
}

type Rgb = [number, number, number];

function oklchToRgb(body: string): Rgb {
  const [lRaw, cRaw, hRaw] = body.trim().split(/\s+/);
  const L = lRaw.endsWith("%") ? parseFloat(lRaw) / 100 : parseFloat(lRaw);
  const C = parseFloat(cRaw);
  const h = (parseFloat(hRaw) * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return lin.map((v) => {
    const c = Math.min(1, Math.max(0, v));
    return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  }) as Rgb;
}

function resolve(name: string, seen = 0): Rgb {
  if (name === "white") return [1, 1, 1];
  if (name === "black") return [0, 0, 0];
  const value = colours.get(name);
  if (!value || seen > 5) throw new Error(`--color-${name} is not declared`);
  const ref = value.match(/^var\(--color-([a-z0-9-]+)\)$/);
  if (ref) return resolve(ref[1], seen + 1);
  const ok = value.match(/^oklch\(([^)]+)\)$/);
  if (ok) return oklchToRgb(ok[1]);
  const hex = value.match(/^#([0-9a-fA-F]{6})$/);
  if (hex) {
    return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16) / 255) as Rgb;
  }
  throw new Error(`cannot read --color-${name}: ${value}`);
}

function luminance([r, g, b]: Rgb): number {
  const f = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function overWhite(c: Rgb, alpha: number): Rgb {
  return c.map((v) => v * alpha + (1 - alpha)) as Rgb;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return p.endsWith(".tsx") ? [p] : [];
  });
}

/** A literal colour this test can measure; theme variables such as
 * `--color-destructive: var(--destructive)` resolve at runtime and are skipped. */
const isColour = (name: string) => {
  try {
    resolve(name);
    return true;
  } catch {
    return false;
  }
};

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
