/**
 * RA-8464 slice 2 guard: the NIR claim panel picks colours by name.
 *
 * Each claim type carries a colour name. The panel looks that name up in
 * COLOR_MAP for the selected tab, and also builds header classes from it at
 * runtime (`text-<colour>-500`, `bg-<colour>-50`, `dark:bg-<colour>-900/10`).
 * Tailwind v4 only compiles class names it can read literally in source, so:
 *
 * 1. every claim colour must have a COLOR_MAP entry, or the tab loses its style;
 * 2. no claim may use the retired Tailwind "cyan" name (DSA-04 moved water
 *    claims to the brand harbour scale);
 * 3. the brand harbour header classes must appear literally in the panel
 *    source, or the water header renders unstyled.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const PANEL = join(
  __dirname,
  "..",
  "..",
  "components",
  "inspection",
  "NIRClaimAssessmentPanel.tsx",
);
const source = readFileSync(PANEL, "utf8");

function block(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`${startMarker} not found in panel`);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`end of ${startMarker} not found`);
  return source.slice(start, end);
}

const claimColours = [
  ...block("const CLAIM_TYPES", "\n];").matchAll(/color:\s*"([^"]+)"/g),
].map((m) => m[1]);
const mapKeys = [
  ...block("const COLOR_MAP", "\n};").matchAll(
    /^\s*(?:"([^"]+)"|([a-z][a-zA-Z]*))\s*:/gm,
  ),
].map((m) => m[1] ?? m[2]);

describe("NIR claim colour map", () => {
  it("finds the claim types and the colour map", () => {
    expect(claimColours.length).toBeGreaterThanOrEqual(10);
    expect(mapKeys.length).toBeGreaterThanOrEqual(10);
  });

  it("gives every claim colour a COLOR_MAP entry", () => {
    const missing = claimColours.filter((c) => !mapKeys.includes(c));
    expect(missing).toEqual([]);
  });

  it("no longer keys any claim on the retired cyan name", () => {
    expect(claimColours).not.toContain("cyan");
    expect(mapKeys).not.toContain("cyan");
  });

  it("uses the brand harbour scale for water claims", () => {
    expect(source).toMatch(/type:\s*"WATER",[\s\S]*?color:\s*"brand-harbour"/);
  });

  it("keeps the runtime-built brand harbour header classes literal in source", () => {
    for (const cls of [
      "text-brand-harbour-500",
      "bg-brand-harbour-50",
      "dark:bg-brand-harbour-900/10",
    ]) {
      expect(source, `${cls} must appear literally for Tailwind`).toContain(cls);
    }
  });
});
