import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// RA-6800: the workflow step PATCH must not let a caller flip a workflow step
// that belongs to another tenant's workflow. The step write must be scoped to
// the workflow already verified as owned by the caller's inspection.

const getServerSession = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/evidence", () => ({
  getWorkflowTemplate: vi.fn(),
  buildWorkflowStepsData: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findFirst: vi.fn() },
    inspectionWorkflow: { findUnique: vi.fn(), update: vi.fn() },
    workflowStep: { update: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { PATCH } from "../route";

const p = prisma as unknown as {
  inspection: { findFirst: ReturnType<typeof vi.fn> };
  inspectionWorkflow: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  workflowStep: {
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "owner_1" } });
});

function patch(inspectionId: string, body: Record<string, unknown>) {
  return PATCH(
    new NextRequest(`http://localhost/api/inspections/${inspectionId}/workflow`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: inspectionId }) },
  );
}

describe("PATCH /api/inspections/[id]/workflow — step ownership", () => {
  it("does not update a step that belongs to another tenant's workflow (IDOR)", async () => {
    // Caller owns their inspection + workflow...
    p.inspection.findFirst.mockResolvedValue({ id: "insp_1" });
    p.inspectionWorkflow.findUnique.mockResolvedValue({
      id: "wf_1",
      totalSteps: 1,
      steps: [],
    });
    // ...but the supplied stepId is not in wf_1 -> scoped write affects 0 rows.
    p.workflowStep.updateMany.mockResolvedValue({ count: 0 });

    const res = await patch("insp_1", {
      stepId: "step_from_other_workflow",
      status: "COMPLETED",
    });

    expect(res.status).toBe(404);
    // Must not proceed to recalc/persist workflow totals on a failed step write.
    expect(p.inspectionWorkflow.update).not.toHaveBeenCalled();
  });

  it("updates a step that belongs to the caller's workflow", async () => {
    p.inspection.findFirst.mockResolvedValue({ id: "insp_1" });
    p.inspectionWorkflow.findUnique.mockResolvedValue({
      id: "wf_1",
      totalSteps: 1,
      steps: [],
    });
    p.workflowStep.updateMany.mockResolvedValue({ count: 1 });
    p.workflowStep.findMany.mockResolvedValue([
      { status: "COMPLETED", isMandatory: true, stepOrder: 1 },
    ]);

    const res = await patch("insp_1", { stepId: "step_1", status: "COMPLETED" });

    expect(res.status).toBe(200);
    expect(p.inspectionWorkflow.update).toHaveBeenCalledTimes(1);
    // The step write was scoped to the verified workflow.
    expect(p.workflowStep.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "step_1", workflowId: "wf_1" }),
      }),
    );
  });
});
