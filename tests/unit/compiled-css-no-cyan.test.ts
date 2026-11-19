/**
 * RA-8464 guard on the stylesheet that actually ships.
 *
 * Tailwind v4 compiles every class-like string it finds in the project, not
 * only the ones in rendered code. After the cyan bridge was removed, the
 * no-cyan source guard's own sample strings (tests/) and an old design note
 * (docs/) still put stock cyan rules into production CSS. app/globals.css now
 * excludes tests/, docs/ and .claude/ from source detection.
 *
 * This test compiles app/globals.css the way the build does and fails if any
 * cyan rule or cyan colour variable is emitted, whatever file it came from.
 * It also checks that brand-harbour utilities still compile, so it cannot pass
 * on an empty or broken stylesheet.
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

describe("compiled app stylesheet has no Tailwind cyan (RA-8464)", () => {
  it("compiles the brand harbour utilities the app uses", () => {
    for (const cls of [
      ".bg-brand-harbour-50",
      ".text-brand-harbour-500",
      ".ring-brand-harbour-400",
    ]) {
      expect(css, cls).toContain(cls);
    }
  });

  it("emits no cyan utility rule", () => {
    const rules = [...css.matchAll(/\.([^\s{,]*cyan-\d+[^\s{,]*)/g)].map(
      (m) => m[1],
    );
    expect([...new Set(rules)]).toEqual([]);
  });

  it("emits no cyan colour variable", () => {
    expect(css.match(/--color-cyan-\d+/g) ?? []).toEqual([]);
  });
});
