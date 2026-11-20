import { describe, it, expect, vi, beforeEach } from "vitest";
import { linkInspectionToReport } from "../link-report-inspection";

describe("linkInspectionToReport", () => {
  const tx = {
    report: { findFirst: vi.fn() },
    inspection: { updateMany: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns linked false when report not owned", async () => {
    tx.report.findFirst.mockResolvedValue(null);
    const result = await linkInspectionToReport(tx as never, {
      inspectionId: "i1",
      reportId: "r1",
      userId: "u1",
    });
    expect(result.linked).toBe(false);
  });

  it("links report and copies clientId from report", async () => {
    tx.report.findFirst.mockResolvedValue({ id: "r1", clientId: "c1" });
    tx.inspection.updateMany.mockResolvedValue({ count: 1 });
    const result = await linkInspectionToReport(tx as never, {
      inspectionId: "i1",
      reportId: "r1",
      userId: "u1",
    });
    expect(result.linked).toBe(true);
    expect(tx.inspection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reportId: "r1",
          clientId: "c1",
        }),
      }),
    );
  });
});
