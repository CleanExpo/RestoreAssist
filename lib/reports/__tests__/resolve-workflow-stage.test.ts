import { describe, it, expect } from "vitest";
import { resolveWorkflowStage } from "../resolve-workflow-stage";

describe("resolveWorkflowStage (RA-6799 report-builder loop)", () => {
  it("a brand-new (non-existent) report with no data starts at initial-entry", () => {
    expect(resolveWorkflowStage(null, false).stage).toBe("initial-entry");
    expect(resolveWorkflowStage({}, false).stage).toBe("initial-entry");
  });

  it("REGRESSION: an EXISTING report with no depth/tier must NOT reset to initial-entry", () => {
    // This was the production infinite loop: a freshly-created report has no
    // depth/tier data, the old logic fell back to "initial-entry", the form
    // re-created another report, and PDF/export was never reached.
    const justCreated = { id: "rep_1", technicianFieldReport: "field notes" };
    const resolved = resolveWorkflowStage(justCreated, true);
    expect(resolved.stage).not.toBe("initial-entry");
    expect(resolved.stage).toBe("report-generation");
  });

  it("basic depth advances straight to report-generation", () => {
    expect(
      resolveWorkflowStage({ id: "r", reportDepthLevel: "basic" }, true).stage,
    ).toBe("report-generation");
  });

  it("enhanced depth (no tiers yet) advances to tier1", () => {
    const r = resolveWorkflowStage(
      { id: "r", reportDepthLevel: "enhanced" },
      true,
    );
    expect(r.stage).toBe("tier1");
    expect(r.reportType).toBe("enhanced");
  });

  it("optimised depth (no tiers yet) advances to tier1 and flags Tier 3", () => {
    const r = resolveWorkflowStage(
      { id: "r", reportDepthLevel: "optimised" },
      true,
    );
    expect(r.stage).toBe("tier1");
    expect(r.reportType).toBe("optimised");
    expect(r.showTier3).toBe(true);
  });

  it("optimised + tier1 responses continues to tier2", () => {
    expect(
      resolveWorkflowStage(
        { id: "r", reportDepthLevel: "optimised", tier1Responses: {} },
        true,
      ).stage,
    ).toBe("tier2");
  });

  it("enhanced + tier1 responses can generate the report", () => {
    expect(
      resolveWorkflowStage(
        { id: "r", reportDepthLevel: "enhanced", tier1Responses: {} },
        true,
      ).stage,
    ).toBe("report-generation");
  });

  it("tier2 / tier3 / detailedReport all resolve to report-generation", () => {
    expect(
      resolveWorkflowStage({ id: "r", tier2Responses: {} }, true).stage,
    ).toBe("report-generation");
    const t3 = resolveWorkflowStage({ id: "r", tier3Responses: {} }, true);
    expect(t3.stage).toBe("report-generation");
    expect(t3.showTier3).toBe(false);
    expect(
      resolveWorkflowStage({ id: "r", detailedReport: "..." }, true).stage,
    ).toBe("report-generation");
  });
});
