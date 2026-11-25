/**
 * Follow-up to RA-8364. A solid `bg-destructive` fill needs label text that
 * reads on it. `text-destructive-foreground` does not: in the light theme
 * `--destructive-foreground` is the same red as `--destructive` (1:1), and in
 * the dark theme it is a lifted red on a dark red fill (about 2.6:1). Both
 * are far below WCAG 1.4.3 (4.5:1 for body text). White on the fill clears
 * 4.5:1 in every theme, which is why the Button `destructive` variant uses
 * `text-white`.
 *
 * This test scans every class string in app/ and components/ that paints a
 * solid `bg-destructive` fill, works out the text colour the same string sets,
 * and measures it against the fill (and the `hover:bg-destructive/NN` state)
 * in each theme block of app/globals.css, using the variables the compiled
 * Tailwind utilities actually read.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { beforeAll, describe, expect, it } from "vitest";
import { contrast, over, parseLiteral, resolve, type Rgb } from "./support/wcag-contrast";

const ROOT = join(__dirname, "..", "..");
const ENTRY = join(ROOT, "app", "globals.css");
const SOURCE = readFileSync(ENTRY, "utf8");
const AA = 4.5;

/** Custom properties declared in the first rule whose selector list starts with `selector`. */
function block(selector: string): Map<string, string> {
  const start = SOURCE.indexOf(`\n${selector}`);
  if (start < 0) throw new Error(`no ${selector} block in app/globals.css`);
  const open = SOURCE.indexOf("{", start);
  const close = SOURCE.indexOf("\n}", open);
  const body = SOURCE.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, "");
  const vars = new Map<string, string>();
  for (const m of body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) vars.set(m[1], m[2].trim());
  return vars;
}

const light = block(":root");
const dark = new Map([...light, ...block(".dark")]);

const THEMES: [string, Map<string, string>][] = [
  ["light", light],
  ["dark", dark],
];

function colourOf(theme: Map<string, string>, name: string, depth = 0): Rgb {
  const value = theme.get(name);
  if (!value || depth > 5) throw new Error(`${name} is not declared for this theme`);
  const brand = value.match(/^var\(--color-([a-z0-9-]+)\)$/);
  if (brand) return resolve(brand[1]);
  const ref = value.match(/^var\((--[a-z0-9-]+)\)$/);
  if (ref) return colourOf(theme, ref[1], depth + 1);
  return parseLiteral(value);
}

let css = "";

/** The custom property a compiled utility reads, e.g. `--destructive`. */
function varOf(utility: string, property: string): string | null {
  const re = new RegExp(`\\.${utility}\\s*\\{\\s*${property}:\\s*var\\((--[a-z0-9-]+)\\)`);
  return css.match(re)?.[1] ?? null;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) out.push(path);
  }
  return out;
}

/** Class strings that paint a solid (no `/NN`) destructive fill with no state or dark prefix. */
function destructiveFillStrings(): { file: string; classes: string[] }[] {
  const found: { file: string; classes: string[] }[] = [];
  for (const file of [...walk(join(ROOT, "app")), ...walk(join(ROOT, "components"))]) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/["'`]([^"'`\n]*)["'`]/g)) {
      const classes = m[1].split(/\s+/).filter(Boolean);
      if (classes.includes("bg-destructive")) found.push({ file: relative(ROOT, file), classes });
    }
  }
  return found;
}

const NOT_COLOUR = /^text-(xs|sm|base|lg|[2-9]?xl|left|center|right|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip)$/;

/** The label colour a class string sets, or null when it sets none. */
function textColour(classes: string[], theme: Map<string, string>): { name: string; rgb: Rgb } | null {
  const token = classes.find((c) => c.startsWith("text-") && !NOT_COLOUR.test(c));
  if (!token) return null;
  if (token === "text-white") return { name: token, rgb: [1, 1, 1] };
  const v = varOf(token, "color");
  if (!v) throw new Error(`.${token} { color: var(...) } was not compiled`);
  return { name: token, rgb: colourOf(theme, v) };
}

beforeAll(async () => {
  const out = await postcss([tailwind({ base: ROOT })]).process(SOURCE, { from: ENTRY });
  css = out.css;
}, 120_000);

describe("text on a solid destructive fill is readable", () => {
  it("the measure can fail (control: text-destructive-foreground on the fill)", () => {
    // The utility is no longer used, so Tailwind does not compile it; read
    // the token it maps to (--color-destructive-foreground) directly.
    const fill = varOf("bg-destructive", "background-color");
    expect(fill).not.toBeNull();
    for (const [, theme] of THEMES) {
      const fg = colourOf(theme, "--destructive-foreground");
      expect(contrast(fg, colourOf(theme, fill!))).toBeLessThan(AA);
    }
  });

  it("finds the destructive fills it is meant to check", () => {
    const files = new Set(destructiveFillStrings().map((s) => s.file));
    expect(files.has("components/ui/button.tsx")).toBe(true);
    expect(files.has("app/dashboard/forms/interview/page.tsx")).toBe(true);
  });

  it("every solid destructive fill carries label text at 4.5:1 or better", () => {
    const fill = varOf("bg-destructive", "background-color")!;
    const failures: string[] = [];
    for (const { file, classes } of destructiveFillStrings()) {
      // A dark: override replaces the fill or the label in that theme; only
      // the light theme is the string's own claim then.
      const themes = classes.some((c) => c.startsWith("dark:bg-") || c.startsWith("dark:text-"))
        ? THEMES.slice(0, 1)
        : THEMES;
      for (const [label, theme] of themes) {
        const ink = textColour(classes, theme);
        if (!ink) continue;
        const bg = colourOf(theme, fill);
        const surface = colourOf(theme, "--popover");
        const states: [string, Rgb][] = [["rest", bg]];
        for (const c of classes) {
          const hover = c.match(/^hover:bg-destructive\/(\d+)$/);
          if (hover) states.push([c, over(bg, Number(hover[1]) / 100, surface)]);
        }
        for (const [state, colour] of states) {
          const ratio = contrast(ink.rgb, colour);
          if (ratio < AA) {
            failures.push(`${file} (${label}, ${state}): ${ink.name} on bg-destructive ${ratio.toFixed(2)}:1`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
