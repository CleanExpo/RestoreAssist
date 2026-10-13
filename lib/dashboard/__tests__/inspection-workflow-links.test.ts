import { describe, expect, it } from "vitest";
import { buildInspectionWorkflowLinks } from "../inspection-workflow-links";

describe("buildInspectionWorkflowLinks", () => {
  it("links to the report when reportId is set", () => {
    const links = buildInspectionWorkflowLinks({
      inspectionId: "insp-1",
      status: "SCOPED",
      reportId: "rep-1",
      clientId: null,
    });
    expect(links.some((l) => l.href === "/dashboard/reports/rep-1")).toBe(true);
  });

  it("surfaces invoice when the job is billable", () => {
    const links = buildInspectionWorkflowLinks({
      inspectionId: "insp-1",
      status: "ESTIMATED",
      reportId: null,
      clientId: null,
    });
    expect(links.some((l) => l.href.includes("/invoice"))).toBe(true);
  });

  it("includes floor plan tab link", () => {
    const links = buildInspectionWorkflowLinks({
      inspectionId: "insp-1",
      status: "DRAFT",
      reportId: null,
      clientId: null,
    });
    expect(
      links.some((l) => l.href.includes("tab=sketch") && l.label === "Floor plan"),
    ).toBe(true);
  });

  it("emphasises guided capture on early statuses", () => {
    const links = buildInspectionWorkflowLinks({
      inspectionId: "insp-1",
      status: "DRAFT",
      reportId: null,
      clientId: null,
    });
    const capture = links.find((l) => l.label === "Guided capture");
    expect(capture?.emphasis).toBe(true);
  });
});
