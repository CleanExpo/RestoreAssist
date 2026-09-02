import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * `AuthorityFormInstance.pdfUrl` has no writer.
 *
 * It is declared on the model and read in several places, but nothing in this
 * repository ever assigns it. (The only code that writes a column called
 * `pdfUrl` is app/api/invoices/[id]/pdf/route.ts, which is the Invoice model.)
 *
 * Two evidence exports used to filter on `pdfUrl: { not: null }`. Because the
 * column is always null, both matched zero rows on every job that has ever run,
 * and the signed client authorisations RA-7003 promises — consent to apply a
 * chemical, authority to dispose of property — were silently absent from every
 * evidence pack. Nothing failed; the folder was simply empty, which is
 * indistinguishable from a job where nobody signed anything.
 *
 * Both now render the PDF in-process through lib/documents/render-authority-form.
 * This gate stops the filter coming back. It is deliberately a source-text check
 * rather than a behavioural one: the defect is not a wrong value at runtime, it
 * is a query predicate on a column no producer populates, and that is visible
 * only in the query.
 *
 * WHEN A WRITER EXISTS, this gate should be deleted, not weakened. Filtering on
 * a populated column is a reasonable thing to do.
 */

const ROOTS = ["lib", "app"];
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "__tests__",
  "dist",
  "build",
]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("AuthorityFormInstance.pdfUrl", () => {
  it("is not used as a query predicate anywhere, because nothing writes it", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of sourceFiles(root)) {
        const src = readFileSync(file, "utf8");
        if (!src.includes("authorityFormInstance")) continue;
        // Any `pdfUrl` inside a where-clause shape. Both historical forms:
        // `pdfUrl: { not: null }` and a bare `pdfUrl: { ... }` predicate.
        if (/pdfUrl:\s*\{/.test(src)) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("proves this check can see an offender", () => {
    // The control. Without it the assertion above passes just as happily against
    // a regex that matches nothing at all — which is how the original filter
    // survived: everything was green, and the folder was empty.
    const planted = `prisma.authorityFormInstance.findMany({ where: { pdfUrl: { not: null } } })`;
    expect(/pdfUrl:\s*\{/.test(planted)).toBe(true);
    expect(planted.includes("authorityFormInstance")).toBe(true);
  });
});
