/**
 * RA-8401 guard: every file that writes a CSV download must build its cells
 * with the shared owner in lib/csv. A file that names the CSV MIME type but
 * does not import lib/csv fails here, unless it is named in EXCEPTIONS with
 * the reason. This is an allow-list: a new hand-written CSV builder is red.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "..", "..", "..");
const ROOTS = ["app", "components", "lib", "hooks"];
// Built by concatenation so this test file never matches itself.
const NEEDLE = "text/" + "csv";
const SHARED_IMPORT = /from\s+["'](@\/lib\/csv\/|\.\.?\/(\.\.\/)*csv\/|\.\/)(csv-cell|cost-library-csv)["']/;

/** Files that name the CSV type without writing cells. Each needs a reason. */
const EXCEPTIONS: Record<string, string> = {
  "lib/google-drive.ts": "names the type for a Drive download; writes no cells",
  "app/api/admin/restoration-insights/annual-report/route.ts":
    "serves toAnnualReportCsv from lib/analytics/annualReport.ts, which uses csvField",
};

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith("."))
      continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

export function findUnsharedCsvWriters(
  files: { path: string; content: string }[],
  exceptions: Record<string, string>,
): string[] {
  return files
    .filter((f) => f.content.includes(NEEDLE))
    .filter((f) => !(f.path in exceptions))
    .filter((f) => !SHARED_IMPORT.test(f.content))
    .map((f) => f.path)
    .sort();
}

function repoFiles() {
  return ROOTS.flatMap((root) => {
    const abs = join(REPO, root);
    try {
      statSync(abs);
    } catch {
      return [];
    }
    return sourceFiles(abs).map((full) => ({
      path: relative(REPO, full).split("\\").join("/"),
      content: readFileSync(full, "utf8"),
    }));
  });
}

describe("CSV writer allow-list (RA-8401)", () => {
  const files = repoFiles();

  it("scans a non-trivial set and finds the known CSV writers", () => {
    const writers = files.filter((f) => f.content.includes(NEEDLE));
    // Positive control: if the scan silently found nothing, the guard below
    // would pass for the wrong reason.
    expect(writers.length).toBeGreaterThanOrEqual(10);
    expect(writers.map((f) => f.path)).toContain(
      "app/dashboard/invoices/payments/page.tsx",
    );
  });

  it("every file that writes text/csv imports the shared writer", () => {
    expect(findUnsharedCsvWriters(files, EXCEPTIONS)).toEqual([]);
  });

  it("flags a planted hand-written writer", () => {
    const planted = {
      path: "app/planted/page.tsx",
      content: `const blob = new Blob([rows.join("\\n")], { type: "${NEEDLE}" });`,
    };
    expect(findUnsharedCsvWriters([...files, planted], EXCEPTIONS)).toEqual([
      "app/planted/page.tsx",
    ]);
  });

  it("every exception still exists and still names the CSV type", () => {
    for (const path of Object.keys(EXCEPTIONS)) {
      const f = files.find((x) => x.path === path);
      expect(f, `stale exception ${path}`).toBeDefined();
      expect(f?.content.includes(NEEDLE), `stale exception ${path}`).toBe(true);
    }
  });
});
