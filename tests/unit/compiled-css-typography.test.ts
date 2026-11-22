/**
 * RA-8524 guard on the stylesheet that actually ships.
 *
 * Help articles (/help/<category>/<slug> and the dashboard copy), the privacy
 * and terms pages and chat answers render inside `prose` classes. The
 * @tailwindcss/typography package was installed but never loaded in
 * app/globals.css, so `prose` compiled to nothing and article headings, lists
 * and code ran together as plain text on production.
 *
 * This test compiles app/globals.css the way the build does and fails unless
 * the prose rules for headings, lists and code are emitted.
 */
import { readFileSync } from "fs";
import { join } from "path";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const ENTRY = join(ROOT, "app", "globals.css");

let css = "";

beforeAll(async () => {
  const out = await postcss([tailwind({ base: ROOT })]).process(
    readFileSync(ENTRY, "utf8"),
    { from: ENTRY },
  );
  css = out.css;
}, 120_000);

/**
 * The body of the first typography rule for element `el`. Tailwind emits the
 * plugin's rules nested under `.prose`, as
 * `:where(h2):not(:where([class~="not-prose"], ...)) { ... }`; the not-prose
 * guard is written only by @tailwindcss/typography.
 */
function proseRuleFor(text: string, el: string): string | null {
  const re = new RegExp(
    `:where\\(${el}\\):not\\(:where\\(\\[class~="not-prose"\\][^{]*\\{([^}]*)\\}`,
  );
  return text.match(re)?.[1] ?? null;
}

describe("compiled app stylesheet loads @tailwindcss/typography (RA-8524)", () => {
  it("the matcher can fail (control)", () => {
    expect(proseRuleFor(".prose { color: red }", "h2")).toBeNull();
    expect(proseRuleFor(".prose-h2\\:font-bold { font-weight: 700 }", "h2")).toBeNull();
    expect(
      proseRuleFor(
        '.prose { :where(h2):not(:where([class~="not-prose"], [class~="not-prose"] *)) { margin-top: 2em } }',
        "h2",
      ),
    ).toContain("margin-top");
  });

  it("still compiles the app's own utilities", () => {
    expect(css).toMatch(/\.bg-brand-harbour-50\b/);
  });

  it("styles article headings, lists and code", () => {
    expect(proseRuleFor(css, "h2"), "h2").toMatch(/font-weight/);
    expect(proseRuleFor(css, "ul"), "ul").toMatch(/list-style-type:\s*disc/);
    expect(proseRuleFor(css, "ol"), "ol").toMatch(/list-style-type:\s*decimal/);
    expect(proseRuleFor(css, "code"), "code").toMatch(/font-weight/);
  });

  it("keeps code monospaced when the Geist Mono face is not matched", () => {
    // Preflight sets code, kbd and pre to this variable.
    const mono = css.match(/--default-mono-font-family:\s*([^;]+);/)?.[1] ?? "";
    expect(mono).toMatch(/\bmonospace\s*$/);
  });

  it("emits the slate colour theme the public help page uses", () => {
    expect(css).toMatch(/\.prose-slate\s*\{/);
  });
});
