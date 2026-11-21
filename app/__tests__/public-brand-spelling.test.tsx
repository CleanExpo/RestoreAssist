/**
 * RA-8403 — the public site spelt the product both "RestoreAssist" and
 * "Restore Assist". The product name is one word. The only two-word uses
 * left are the legal entity lines ("trading as Restore Assist", "Restore
 * Assist by Unite-Group Nexus Pty Ltd"), which name the business as
 * registered, not the product.
 *
 * Scope: the public marketing pages and the components they share. Signed-in
 * screens, emails and the pricing cost disclosure are tracked separately on
 * the issue.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

const PUBLIC_DIRS = [
  "app/about",
  "app/blog",
  "app/compliance-library",
  "app/contact",
  "app/demo",
  "app/features",
  "app/help",
  "app/how-it-works",
  "app/pricing",
  "app/privacy",
  "app/resources",
  "app/solutions",
  "app/support",
  "app/terms",
  "components/landing",
  "components/seo",
];

const SOURCE = /\.(tsx?|jsx?|mdx?)$/;

/** Two-word uses that name the registered business, not the product. */
function isLegalEntityUse(prev: string, line: string): boolean {
  if (/Restore Assist by Unite-Group Nexus Pty Ltd/.test(line)) return true;
  if (/trading\s+as Restore Assist\b/.test(line)) return true;
  return /trading\s*$/.test(prev) && /^\s*as Restore Assist\b/.test(line);
}

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === "__tests__" ? [] : walk(full);
    return SOURCE.test(d.name) ? [full] : [];
  });
}

function findTwoWordBrand(text: string): number[] {
  const lines = text.split("\n");
  const hits: number[] = [];
  lines.forEach((line, i) => {
    if (!/Restore Assist/.test(line)) return;
    if (isLegalEntityUse(i > 0 ? lines[i - 1] : "", line)) return;
    hits.push(i + 1);
  });
  return hits;
}

describe("public brand spelling (RA-8403)", () => {
  it("the scan can fail (control)", () => {
    expect(findTwoWordBrand('title: "Contact Restore Assist"')).toEqual([1]);
    expect(findTwoWordBrand("Restore Assist by Unite-Group Nexus Pty Ltd")).toEqual([]);
    expect(findTwoWordBrand("operated by X, trading\n  as Restore Assist (we)")).toEqual([]);
    expect(findTwoWordBrand("RestoreAssist")).toEqual([]);
  });

  it("public pages spell the product RestoreAssist", () => {
    const files = PUBLIC_DIRS.flatMap((d) => walk(path.join(ROOT, d)));
    // Positive control: the walk really reaches the public pages.
    expect(files.length).toBeGreaterThan(20);
    const offenders = files.flatMap((f) =>
      findTwoWordBrand(fs.readFileSync(f, "utf8")).map(
        (n) => `${path.relative(ROOT, f)}:${n}`,
      ),
    );
    expect(offenders).toEqual([]);
  });
});
