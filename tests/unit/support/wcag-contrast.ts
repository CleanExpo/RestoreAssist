import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Shared WCAG contrast arithmetic for the source-scanning contrast guards
 * (RA-8479 admin pages, RA-4868 public pages). Colours resolve from
 * Tailwind's theme.css and app/globals.css, the same values the browser uses.
 */

const ROOT = process.cwd();

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

/** sRGB channels, 0 to 1, gamma-encoded. */
export type Rgb = [number, number, number];

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

/** A `#rrggbb` literal as channels. */
export function hexToRgb(hex: string): Rgb {
  const m = hex.match(/^#([0-9a-fA-F]{6})$/);
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255) as Rgb;
}

/** Resolve a Tailwind colour name (`slate-500`, `brand-navy`, `white`). */
export function resolve(name: string, seen = 0): Rgb {
  if (name === "white") return [1, 1, 1];
  if (name === "black") return [0, 0, 0];
  const value = colours.get(name);
  if (!value || seen > 5) throw new Error(`--color-${name} is not declared`);
  const ref = value.match(/^var\(--color-([a-z0-9-]+)\)$/);
  if (ref) return resolve(ref[1], seen + 1);
  const ok = value.match(/^oklch\(([^)]+)\)$/);
  if (ok) return oklchToRgb(ok[1]);
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return hexToRgb(value);
  throw new Error(`cannot read --color-${name}: ${value}`);
}

/** A literal `oklch(...)` or `#rrggbb` value, as written in a stylesheet. */
export function parseLiteral(value: string): Rgb {
  const v = value.trim();
  const ok = v.match(/^oklch\(([^)]+)\)$/);
  if (ok) return oklchToRgb(ok[1]);
  return hexToRgb(v);
}

/** A literal colour the guards can measure; runtime theme variables are not. */
export function isColour(name: string): boolean {
  try {
    resolve(name);
    return true;
  } catch {
    return false;
  }
}

export function luminance([r, g, b]: Rgb): number {
  const f = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a: Rgb, b: Rgb): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** `colour` at `alpha` painted over `surface` (how `text-x/NN` renders). */
export function over(colour: Rgb, alpha: number, surface: Rgb): Rgb {
  return colour.map((v, i) => v * alpha + surface[i] * (1 - alpha)) as Rgb;
}

/** `colour` at `alpha` painted over white. */
export function overWhite(c: Rgb, alpha: number): Rgb {
  return over(c, alpha, [1, 1, 1]);
}
