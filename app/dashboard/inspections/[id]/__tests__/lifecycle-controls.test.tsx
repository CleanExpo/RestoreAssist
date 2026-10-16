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
    // What matters is that `canSignOff` gates <InspectionSignOff>, not how the
    // block is wrapped. The wrapper <div> moved OUTSIDE this conditional in
    // 04951e56d so the field evidence checklist renders unconditionally, which
    // broke the previous nesting-specific pattern without changing the
    // behaviour under test.
    //
    // The optional group is a single opening tag, NOT `[\s\S]*?`. An unbounded
    // gap — which the previous pattern also had — lets the match start at any
    // other `{canSignOff && (` in the file and run forward to an
    // <InspectionSignOff> that is no longer gated at all, so the assertion
    // would pass while the behaviour it names was gone.
    expect(source).toMatch(
      /\{canSignOff && \(\s*(?:<div[^>]*>\s*)?<InspectionSignOff/,
    );
  });

  it("only exposes invoice generation after sign-off or while already billing", () => {
    expect(source).toMatch(
      /const canGenerateInvoice =\s*\(inspection\.status === "SUBMITTED" && Boolean\(inspection\.signedAt\)\) \|\|\s*inspection\.status === "IN_BILLING"/,
    );
    // 12b350bb8 wrapped the link in the design-system <Button asChild>. The
    // gaps stay bounded (see the sign-off note above) so the match cannot run
    // on to an ungated "Generate Invoice" elsewhere in the file.
    expect(source).toMatch(
      /\{canGenerateInvoice && \(\s*(?:<Button\b[^>]*>\s*)?<Link\b[^>]*>[\s\S]{0,200}?Generate Invoice/,
    );
  });

  it("exposes report generation for review-ready work without reopening billing", () => {
    expect(source).toMatch(
      /const canGenerateReport =\s*\["ESTIMATED", "SUBMITTED", "COMPLETED"\]\.includes\(\s*inspection\.status,?\s*\)/,
    );
    expect(source).toMatch(
      /\{canGenerateReport && \(\s*<(?:button|Button)\b[\s\S]{0,600}?Generate NIR Report/,
    );
  });
});
