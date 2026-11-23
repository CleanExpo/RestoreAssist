/**
 * RA-8364. Error text uses `text-destructive`. The app runs in the dark theme,
 * where `--destructive` is a dark red fill (white button text on it is about
 * 10:1). Read as text on a dark card, the same red is about 1.7:1, far below
 * WCAG 1.4.3 (4.5:1 for body text).
 *
 * The fix splits the token: `text-destructive` reads `--destructive-text`
 * through Tailwind's `--text-color-*` namespace, while `bg-destructive` and
 * `border-destructive` keep the fill red.
 *
 * This test compiles app/globals.css the way the build does, reads the
 * variable that `.text-destructive` and `.bg-destructive` actually use, and
 * measures them against every surface token in each theme block: light
 * (:root), dark (.dark) and the light island (.setup-wizard-surface) that sits
 * inside dark mode. A later token change that drops error text below 4.5:1
 * fails here.
 */
import { readFileSync } from "fs";
import { join } from "path";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { beforeAll, describe, expect, it } from "vitest";
import {
  contrast,
  over,
  parseLiteral,
  resolve,
  type Rgb,
} from "./support/wcag-contrast";

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
// The wizard pane is light but sits inside <html class="dark">, so anything it
// does not redeclare arrives with its dark value.
const island = new Map([...dark, ...block(".setup-wizard-surface")]);

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
function varOf(utility: string, property: string): string {
  const re = new RegExp(`\\.${utility}\\s*\\{\\s*${property}:\\s*var\\((--[a-z0-9-]+)\\)`);
  const m = css.match(re);
  if (!m) throw new Error(`.${utility} { ${property}: var(...) } was not compiled`);
  return m[1];
}

beforeAll(async () => {
  const out = await postcss([tailwind({ base: ROOT })]).process(SOURCE, { from: ENTRY });
  css = out.css;
}, 120_000);

const SURFACES = ["--background", "--card", "--popover", "--muted", "--secondary", "--accent"];

const THEMES: [string, Map<string, string>][] = [
  ["light (:root)", light],
  ["dark (.dark)", dark],
  ["setup wizard (.setup-wizard-surface inside .dark)", island],
];

describe("RA-8364 destructive text is readable in every theme", () => {
  it("the measure can fail (control: the dark fill red as text)", () => {
    expect(contrast(colourOf(dark, "--destructive"), colourOf(dark, "--card"))).toBeLessThan(AA);
  });

  it("error text reaches 4.5:1 on every surface", () => {
    const text = varOf("text-destructive", "color");
    const failures: string[] = [];
    for (const [label, theme] of THEMES) {
      const ink = colourOf(theme, text);
      for (const surface of SURFACES) {
        const bg = colourOf(theme, surface);
        const ratio = contrast(ink, bg);
        if (ratio < AA) failures.push(`${label}: ${text} on ${surface} ${ratio.toFixed(2)}:1`);
      }
      // Inline errors often sit on a bg-destructive/10 tint over the card.
      const tint = over(colourOf(theme, varOf("bg-destructive", "background-color")), 0.1, colourOf(theme, "--card"));
      const ratio = contrast(ink, tint);
      if (ratio < AA) failures.push(`${label}: ${text} on bg-destructive/10 ${ratio.toFixed(2)}:1`);
    }
    expect(failures).toEqual([]);
  });

  it("destructive fills still carry white text at 4.5:1", () => {
    const fill = varOf("bg-destructive", "background-color");
    for (const [label, theme] of THEMES) {
      const ratio = contrast([1, 1, 1], colourOf(theme, fill));
      expect(ratio, `${label}: white on ${fill}`).toBeGreaterThanOrEqual(AA);
    }
  });
});
