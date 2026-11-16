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
// RA-7721: the handler now gates through the shared tenancy helper; the
// caller here is the owner, so it resolves to the owner's write filters.
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionReadable: vi.fn(),
  assertInspectionAssignedWrite: vi.fn().mockResolvedValue({
    ok: true,
    data: {
      inspectionWhere: { id: "insp_1", OR: [{ userId: "owner_1" }] },
      inspectionManyWhere: { id: "insp_1", OR: [{ userId: "owner_1" }] },
      childInspectionFilter: { OR: [{ userId: "owner_1" }] },
      viaAssignment: false,
    },
  }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findFirst: vi.fn() },
    inspectionWorkflow: { findUnique: vi.fn(), update: vi.fn() },
    workflowStep: { update: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
    evidenceItem: { findMany: vi.fn() },
    exceptionReason: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { GET, PATCH } from "../route";
import { assertInspectionReadable } from "@/lib/auth/assert-tenancy";
import { countableEvidence } from "@/lib/evidence/countable-evidence";

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

// RA-8388: the capture page counts each step's progress from this list. A
// retired reading's evidence record must not be in it, or the step reads
// five of five with four valid readings.
describe("GET /api/inspections/[id]/workflow — evidence that counts", () => {
  it("loads only evidence that counts", async () => {
    vi.mocked(assertInspectionReadable).mockResolvedValue({
      ok: true,
      data: {},
    } as never);
    const pg = prisma as unknown as {
      inspectionWorkflow: { findUnique: ReturnType<typeof vi.fn> };
      evidenceItem: { findMany: ReturnType<typeof vi.fn> };
      exceptionReason: { findMany: ReturnType<typeof vi.fn> };
    };
    pg.inspectionWorkflow.findUnique.mockResolvedValue({ id: "wf_1", steps: [] });
    pg.evidenceItem.findMany.mockResolvedValue([]);
    pg.exceptionReason.findMany.mockResolvedValue([]);

    const res = await GET(
      new NextRequest("http://localhost/api/inspections/insp_1/workflow"),
      { params: Promise.resolve({ id: "insp_1" }) },
    );

    expect(res.status).toBe(200);
    expect(pg.evidenceItem.findMany.mock.calls[0][0].where).toEqual(
      countableEvidence({ inspectionId: "insp_1" }),
    );
  });
});
