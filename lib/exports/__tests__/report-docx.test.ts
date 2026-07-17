import { describe, expect, it } from "vitest";
import { buildReportDocx } from "@/lib/exports/report-docx";

describe("buildReportDocx", () => {
  it("returns a DOCX buffer with a ZIP signature", async () => {
    const buf = await buildReportDocx({
      claimReference: "CLM-1",
      inspectionReport: "Inspection body",
      scopeOfWorks: "Scope body",
      costEstimation: "Cost body",
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(100);
    // DOCX is a ZIP container
    expect(buf.subarray(0, 2).toString("utf8")).toBe("PK");
  });
});
