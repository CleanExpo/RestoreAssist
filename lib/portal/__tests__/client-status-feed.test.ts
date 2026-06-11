import { describe, it, expect } from "vitest";
import { buildClientStatusFeed } from "../client-status-feed";

describe("buildClientStatusFeed", () => {
  it("marks steps done up to the current status and labels the current step", () => {
    const f = buildClientStatusFeed({
      status: "SCOPED",
      workflow: null,
      reportStatus: null,
      pendingApprovals: [],
    });
    expect(f.currentStep).toBe("Scope prepared");
    expect(f.steps.find((s) => s.key === "SUBMITTED")?.done).toBe(true);
    expect(f.steps.find((s) => s.key === "SCOPED")?.done).toBe(true);
    expect(f.steps.find((s) => s.key === "COMPLETED")?.done).toBe(false);
    expect(f.progressPct).toBe(75); // index 3 of 5 steps → 3/4
  });

  it("prefers the workflow submissionScore for progress when present", () => {
    const f = buildClientStatusFeed({
      status: "SUBMITTED",
      workflow: { submissionScore: 42.6 },
      reportStatus: null,
      pendingApprovals: [],
    });
    expect(f.progressPct).toBe(43);
  });

  it("flags report-ready and labels pending approvals", () => {
    const f = buildClientStatusFeed({
      status: "COMPLETED",
      workflow: null,
      reportStatus: "COMPLETED",
      pendingApprovals: [
        { id: "ra_1", approvalType: "SCOPE_OF_WORK" },
        { id: "ra_2", approvalType: "COST_ESTIMATE" },
      ],
    });
    expect(f.reportReady).toBe(true);
    expect(f.pendingApprovals).toEqual([
      { id: "ra_1", type: "SCOPE_OF_WORK", label: "Scope of works" },
      { id: "ra_2", type: "COST_ESTIMATE", label: "Cost estimate" },
    ]);
  });

  it("defaults unknown status to Received with 0% and never leaks raw types", () => {
    const f = buildClientStatusFeed({
      status: "SOME_INTERNAL_STATE",
      workflow: null,
      reportStatus: null,
      pendingApprovals: [{ id: "x", approvalType: "WEIRD_INTERNAL" }],
    });
    expect(f.currentStep).toBe("Received");
    expect(f.progressPct).toBe(0);
    expect(f.pendingApprovals[0].label).toBe("Approval needed");
  });
});
