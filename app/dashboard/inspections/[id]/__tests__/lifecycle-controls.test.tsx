import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(process.cwd(), "app/dashboard/inspections/[id]/page.tsx"),
  "utf8",
);

/**
 * The JSX block a gate renders: from `{gate && (` to its matching `)`, found
 * by bracket balance rather than a character window, so a harmless gated
 * element followed by an ungated sibling cannot satisfy the assertion.
 * Returns null when the gate is absent.
 */
function gatedBlock(gate: string): { block: string; rest: string } | null {
  const open = `{${gate} && (`;
  const start = source.indexOf(open);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start + open.length - 1; i < source.length; i++) {
    if (source[i] === "(") depth++;
    else if (source[i] === ")" && --depth === 0) {
      return {
        block: source.slice(start, i + 1),
        rest: source.slice(0, start) + source.slice(i + 1),
      };
    }
  }
  return null;
}

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
    // The invoice action lives only inside the canGenerateInvoice block: present
    // there, and nowhere else in the page (no ungated copy beside a gated one).
    const gated = gatedBlock("canGenerateInvoice");
    expect(gated, "canGenerateInvoice gate is missing").not.toBeNull();
    expect(gated!.block).toContain("Generate Invoice");
    expect(gated!.block).toMatch(/\/invoice`/);
    expect(gated!.rest).not.toContain("Generate Invoice");
    expect(gated!.rest).not.toMatch(/\/invoice`/);
  });

  it("exposes report generation for review-ready work without reopening billing", () => {
    expect(source).toMatch(
      /const canGenerateReport =\s*\["ESTIMATED", "SUBMITTED", "COMPLETED"\]\.includes\(\s*inspection\.status,?\s*\)/,
    );
    const gated = gatedBlock("canGenerateReport");
    expect(gated, "canGenerateReport gate is missing").not.toBeNull();
    expect(gated!.block).toContain("onClick={handleGenerateReport}");
    expect(gated!.block).toContain("Generate NIR Report");
    expect(gated!.rest).not.toContain("onClick={handleGenerateReport}");
    expect(gated!.rest).not.toContain("Generate NIR Report");
  });
});
