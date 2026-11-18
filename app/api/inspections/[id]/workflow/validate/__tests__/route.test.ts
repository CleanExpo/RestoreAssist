import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// RA-8388: this endpoint is the five-reading gate the capture screen shows.
// A signed reading that was retired leaves its evidence record behind. That
// record must not count, or a step reads five of five with four valid readings.

vi.mock("next-auth", () => ({
  getServerSession: vi.fn().mockResolvedValue({ user: { id: "owner_1" } }),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionReadable: vi.fn().mockResolvedValue({ ok: true, data: {} }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { inspectionWorkflow: { findFirst: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import { COUNTABLE_EVIDENCE_WHERE } from "@/lib/evidence/countable-evidence";
import { GET } from "../route";

const findFirst = (
  prisma as unknown as {
    inspectionWorkflow: { findFirst: ReturnType<typeof vi.fn> };
  }
).inspectionWorkflow.findFirst;

function get() {
  return GET(
    new NextRequest("http://localhost/api/inspections/insp_1/workflow/validate"),
    { params: Promise.resolve({ id: "insp_1" }) },
  );
}

function moistureStep(evidenceCount: number) {
  return {
    id: "step_1",
    stepKey: "moisture_mapping",
    stepTitle: "Moisture Mapping",
    status: "COMPLETED",
    isMandatory: true,
    riskTier: 2,
    minimumEvidenceCount: 5,
    requiredEvidenceClasses: '["MOISTURE_READING"]',
    _count: { evidenceItems: evidenceCount },
  };
}

beforeEach(() => {
  findFirst.mockReset();
});

describe("GET /api/inspections/[id]/workflow/validate", () => {
  it("counts only evidence that counts toward each step's minimum", async () => {
    findFirst.mockResolvedValue({
      id: "wf_1",
      jobType: "water",
      experienceLevel: "APPRENTICE",
      steps: [moistureStep(5)],
    });

    await get();

    const arg = findFirst.mock.calls[0][0] as {
      include: {
        steps: { select: { _count: { select: { evidenceItems: unknown } } } };
      };
    };
    expect(arg.include.steps.select._count.select.evidenceItems).toEqual({
      where: COUNTABLE_EVIDENCE_WHERE,
    });
  });

  it("blocks a completed step that has dropped to four of five", async () => {
    findFirst.mockResolvedValue({
      id: "wf_1",
      jobType: "water",
      experienceLevel: "APPRENTICE",
      steps: [moistureStep(4)],
    });

    const res = await get();
    const body = await res.json();

    expect(body.validation.canSubmit).toBe(false);
    expect(body.validation.blockingGaps).toEqual([
      expect.objectContaining({
        stepKey: "moisture_mapping",
        issue: "below_minimum",
        detail: "4/5 evidence items captured",
      }),
    ]);
  });
});
