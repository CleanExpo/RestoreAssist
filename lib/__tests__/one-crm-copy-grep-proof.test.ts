/**
 * RA-7660 (One CRM, Unit A1) — grep proof for every changed string.
 *
 * The old homepage H1 and every user-facing NRPG sentence that was REMOVED
 * (not merely switched off) must appear nowhere in the code that reaches a
 * customer: app/, components/, lib/ (including lib/email-templates* and the
 * blog), public/ and the store listing under ops/fastlane. Tests are skipped,
 * because they quote the old strings on purpose.
 *
 * Whitespace is collapsed before matching, so a sentence split across JSX
 * lines is still caught.
 *
 * Switched-off items (the DR-NRPG card and modal, the ServiceM8 / MYOB /
 * QuickBooks cards, Import Data) keep their strings in source behind their
 * NEXT_PUBLIC_* switch; their absence is proven on the rendered page in
 * app/dashboard/integrations/__tests__/one-crm-visibility.test.tsx instead.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const ROOTS = ["app", "components", "lib", "public", "ops/fastlane"];
const SKIP_DIRS = new Set(["node_modules", ".next", "__tests__", "__mocks__"]);
const EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|txt|md|mdx|html)$/;
const TEST_FILE = /\.(test|spec)\.[a-z]+$/;

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full, out);
    } else if (EXT.test(name) && !TEST_FILE.test(name)) {
      out.push(full);
    }
  }
}

const files: string[] = [];
for (const r of ROOTS) walk(join(ROOT, r), files);
const corpus = files.map((f) => {
  const raw = readFileSync(f, "utf8");
  return { file: relative(ROOT, f), raw, flat: raw.replace(/\s+/g, " ") };
});

function whereIs(needle: string): string[] {
  const flatNeedle = needle.replace(/\s+/g, " ");
  return corpus
    .filter((c) => c.raw.includes(needle) || c.flat.includes(flatNeedle))
    .map((c) => c.file);
}

const REMOVED: readonly string[] = [
  // Homepage H1 (recipe item 5).
  "Restoration software that works for you. Not the insurer.",
  // Service CRM add-on (pricing page + in-app add-ons).
  "Connect Ascora or DR-NRPG to sync jobs and pricing data.",
  // Bookkeeping add-on: the three-provider sentence is now built only when
  // the MYOB and QuickBooks switches are on.
  "Connect and sync Xero, QuickBooks or MYOB.",
  // NIR Australian Compliance section header.
  "DR-NRPG · Insurer · Technician credentials",
  // Dashboard inbound-job banner.
  "new job from DR/NRPG",
  "new jobs from DR/NRPG",
  "Inbound DR/NRPG jobs",
  // Pricing-configuration validation errors.
  "outside the NRPG typical range",
  // Quote generator.
  "NRPG-rated quotes",
  "National Restoration Pricing Guide (NRPG)",
  // Inspection cost-estimate panel.
  "company NRPG rates",
  "the NRPG pricing engine",
  // Public blog.
  "NRPG-aware pricing",
  '"NRPG rates"',
  // public/llms.txt integrations list.
  "DR-NRPG (claims distribution network)",
  // Public avian-influenza resource page.
  "DisasterRecovery.com.au and NRPG",
  // Google Play store listing.
  "Disaster Recovery / NRPG",
];

describe("grep proof — positive controls (the scan can find things)", () => {
  it("reads a realistic number of files from every root", () => {
    expect(files.length).toBeGreaterThan(500);
    for (const r of ROOTS) {
      expect(corpus.some((c) => c.file.startsWith(r + "/"))).toBe(true);
    }
  });

  it("finds the new homepage H1", () => {
    expect(
      whereIs(
        "The CRM built for Australian and New Zealand restoration professionals. One product, not three.",
      ),
    ).toContain("components/landing/home/homeContent.ts");
  });

  it("finds a switched-off string that legitimately stays in source", () => {
    expect(whereIs("DR-NRPG Integration")).toContain(
      "app/dashboard/integrations/page.tsx",
    );
  });

  it("finds a multi-line JSX sentence only after whitespace collapse", () => {
    // The switched-off DR-NRPG card description is split across two source
    // lines, so a raw substring search cannot see it; the collapsed one must.
    const sentence =
      "Disaster Recovery NRPG — receive job dispatch events via webhook";
    const page = corpus.find(
      (c) => c.file === "app/dashboard/integrations/page.tsx",
    );
    expect(page?.raw.includes(sentence)).toBe(false);
    expect(whereIs(sentence)).toContain("app/dashboard/integrations/page.tsx");
  });
});

describe("grep proof — removed strings appear nowhere user-facing", () => {
  it.each(REMOVED)("%j is gone", (needle) => {
    expect(whereIs(needle)).toEqual([]);
  });

  it("public/llms.txt and the store listing do not mention NRPG at all", () => {
    for (const file of [
      "public/llms.txt",
      "ops/fastlane/metadata/android/en-AU/full_description.txt",
    ]) {
      const entry = corpus.find((c) => c.file === file);
      expect(entry, `${file} was not scanned`).toBeDefined();
      expect(entry!.raw).not.toMatch(/NRPG/i);
    }
  });
});
