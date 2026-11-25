import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * RA-8110: the canary spec clicked "Preview motion" and "theme" buttons before React had hydrated, so the
 * click was lost and the run failed for a reason that was not the page under test (seen twice).
 * One owner for the wait: every "Preview motion" click goes through previewMotion(), which retries until
 * the page reports data-animated. This reads the spec text, so it can only be as strong as the pattern:
 * it fails when a raw click on that button sits anywhere outside the helper.
 */
const SPEC = join(__dirname, "..", "..", "..", "..", "e2e", "report-canary", "report-theme-canary.spec.ts");

export function rawPreviewMotionClicks(source: string): number {
  const start = source.indexOf("async function previewMotion(");
  const end = start === -1 ? -1 : source.indexOf("\n}\n", start);
  const outside = start === -1 || end === -1 ? source : source.slice(0, start) + source.slice(end + 3);
  return (outside.match(/name:\s*"Preview motion"[^)]*\)\s*\.click\(/g) ?? []).length;
}

describe("canary spec waits for hydration before clicking Preview motion", () => {
  it("has no raw Preview motion click outside previewMotion()", () => {
    expect(rawPreviewMotionClicks(readFileSync(SPEC, "utf8"))).toBe(0);
  });

  it("PLANTED: the old click-before-hydrate form is caught", () => {
    const old = [
      'async function previewMotion(page) {\n  await expect(async () => {\n    await page.getByRole("button", { name: "Preview motion" }).click();\n  }).toPass();\n}\n',
      'await page.getByRole("button", { name: "Preview motion" }).click();',
    ].join("\n");
    expect(rawPreviewMotionClicks(old)).toBe(1);
  });

  it("PLANTED: a spec with no helper at all is caught", () => {
    expect(rawPreviewMotionClicks('await page.getByRole("button", { name: "Preview motion" }).click();')).toBe(1);
  });
});
