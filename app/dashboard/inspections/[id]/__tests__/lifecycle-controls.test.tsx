import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(process.cwd(), "app/dashboard/inspections/[id]/page.tsx"),
  "utf8",
);

describe("inspection lifecycle controls", () => {
  it("keeps sign-off visible from completed work through signed submission", () => {
    expect(source).toMatch(
      /const canSignOff =\s*\["ESTIMATED", "COMPLETED", "SUBMITTED"\]\.includes\(\s*inspection\.status,?\s*\)/,
    );
    // The wrapper div moved OUTSIDE this guard so the evidence checklist could
    // share it, which left the old `\(\s*<div` shape unmatchable. Assert the
    // invariant instead of the layout: InspectionSignOff renders under canSignOff.
    // The inner `(?!\)\})` is load-bearing — a plain `[\s\S]*?` runs past the
    // guard's closing `)}` and matches the component ANYWHERE later in the file,
    // so the test would pass even with sign-off rendered unguarded.
    expect(source).toMatch(
      /\{canSignOff && \((?:(?!\)\})[\s\S])*?<InspectionSignOff/,
    );
  });

  it("only exposes invoice generation after sign-off or while already billing", () => {
    expect(source).toMatch(
      /const canGenerateInvoice =\s*\(inspection\.status === "SUBMITTED" && Boolean\(inspection\.signedAt\)\) \|\|\s*inspection\.status === "IN_BILLING"/,
    );
    expect(source).toMatch(
      /\{canGenerateInvoice && \(\s*<Link[\s\S]*?Generate Invoice/,
    );
  });

  it("exposes report generation for review-ready work without reopening billing", () => {
    expect(source).toMatch(
      /const canGenerateReport =\s*\["ESTIMATED", "SUBMITTED", "COMPLETED"\]\.includes\(\s*inspection\.status,?\s*\)/,
    );
    expect(source).toMatch(
      /\{canGenerateReport && \(\s*<button[\s\S]*?Generate NIR Report/,
    );
  });
});
