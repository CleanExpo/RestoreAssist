import { describe, it, expect, vi, beforeEach } from "vitest";
import { ensureInspectionWorkflowFromClaimType } from "../ensure-inspection-workflow";

function mockTx() {
  const createdSteps: unknown[] = [];
  return {
    inspectionWorkflow: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: "wf-1",
        inspectionId: "insp-1",
        jobType: "CARPET",
      }),
    },
    workflowStep: {
      create: vi.fn().mockImplementation(async (args: { data: unknown }) => {
        createdSteps.push(args.data);
      }),
    },
    createdSteps,
  };
}

describe("ensureInspectionWorkflowFromClaimType", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a workflow for CARPET claim type", async () => {
    const tx = mockTx();
    const jobType = await ensureInspectionWorkflowFromClaimType(
      tx as never,
      "insp-1",
      "CARPET",
    );
    expect(jobType).toBe("CARPET");
    expect(tx.inspectionWorkflow.create).toHaveBeenCalledOnce();
    expect(tx.workflowStep.create.mock.calls.length).toBeGreaterThan(0);
  });

  it("is a no-op when a workflow already exists", async () => {
    const tx = mockTx();
    tx.inspectionWorkflow.findUnique.mockResolvedValue({ id: "existing" });
    await ensureInspectionWorkflowFromClaimType(tx as never, "insp-1", "HVAC");
    expect(tx.inspectionWorkflow.create).not.toHaveBeenCalled();
  });

  it("returns null for unknown claim types", async () => {
    const tx = mockTx();
    const jobType = await ensureInspectionWorkflowFromClaimType(
      tx as never,
      "insp-1",
      "NOT_A_CLAIM",
    );
    expect(jobType).toBeNull();
    expect(tx.inspectionWorkflow.create).not.toHaveBeenCalled();
  });
});