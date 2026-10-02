import { describe, expect, it } from "vitest";
import { generateSingleReportExcel } from "../excel-export";

describe("single report Excel history", () => {
  it("includes the invalidation event but excludes its private draft snapshot", async () => {
    const workbook = await generateSingleReportExcel({
      id: "synthetic-report",
      title: "Synthetic report",
      status: "DRAFT",
      clientName: "Synthetic client",
      propertyAddress: "1 Synthetic Street",
      hazardType: "Water",
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
      versionHistory: JSON.stringify([{
        version: 2,
        action: "Automatic draft invalidated",
        changes: "Draft removed pending human review",
        invalidatedDraftSnapshot: { detailedReport: "synthetic unsafe draft" },
      }]),
    });

    const sheet = workbook.getWorksheet("Version History");
    expect(sheet).toBeDefined();
    expect(sheet?.getCell("A2").value).toBe(2);
    expect(sheet?.getCell("D2").value).toBe("Draft removed pending human review");
    const values: string[] = [];
    sheet?.eachRow((row) => row.eachCell((cell) => values.push(String(cell.value))));
    expect(values.join(" ")).not.toContain("synthetic unsafe draft");
  });
});
