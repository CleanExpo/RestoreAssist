/**
 * D-028 — the draft snapshot stays with the owner's reach.
 *
 * Saving a draft snapshot deletes rows: moisture readings the form no longer
 * holds, affected areas, every scope item and the technician's classification
 * choice. D-028 grants the assigned technician create and update only, so this
 * PUT refuses them with 403 and writes nothing. Their field edits go through
 * the per-record routes instead.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  session: vi.fn(),
  resolveInspectionWrite: vi.fn(),
  assertInspectionAssignedWrite: vi.fn(),
  inspectionFindUnique: vi.fn(),
  inspectionCount: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: m.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
// Both gates are mocked the way the real helpers answer for the job's
// assigned technician: the owner's write reach refuses them (404), the
// assigned-write helper admits them (viaAssignment: true).
vi.mock("@/lib/auth/assert-tenancy", () => ({
  resolveInspectionWrite: m.resolveInspectionWrite,
  assertInspectionAssignedWrite: m.assertInspectionAssignedWrite,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: m.inspectionFindUnique, count: m.inspectionCount },
    $transaction: m.transaction,
  },
}));

import { PUT } from "../route";

const SCOPE = { id: "insp-1", technicianId: "tech-1", user: { organizationId: "org-1" } };

const put = () =>
  PUT(
    new NextRequest("http://localhost/api/inspections/insp-1/draft-snapshot", {
      method: "PUT",
      body: JSON.stringify({
        environmentalData: null,
        moistureReadings: [],
        affectedAreas: [],
        scopeItems: [],
        baseIds: { moistureReadings: ["owner-reading-1"] },
      }),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id: "insp-1" }) },
  );

beforeEach(() => {
  vi.resetAllMocks();
  m.session.mockResolvedValue({ user: { id: "tech-1" } });
  m.resolveInspectionWrite.mockResolvedValue({
    ok: false,
    status: 404,
    reason: "Inspection not found",
  });
  m.assertInspectionAssignedWrite.mockResolvedValue({
    ok: true,
    data: {
      inspectionWhere: SCOPE,
      inspectionManyWhere: SCOPE,
      childInspectionFilter: { technicianId: "tech-1", user: { organizationId: "org-1" } },
      viaAssignment: true,
    },
  });
  m.inspectionFindUnique.mockResolvedValue({ id: "insp-1", status: "DRAFT" });
  m.inspectionCount.mockResolvedValue(1);
  m.transaction.mockResolvedValue(undefined);
});

describe("draft-snapshot PUT is owner/manager only (D-028)", () => {
  it("refuses the assigned technician with 403 and writes nothing", async () => {
    const res = await put();
    expect(res.status, await res.clone().text()).toBe(403);
    expect(m.transaction).not.toHaveBeenCalled();
    expect(m.assertInspectionAssignedWrite).not.toHaveBeenCalled();
  });

  it("anyone else outside the owner's reach still gets an opaque 404", async () => {
    m.inspectionCount.mockResolvedValue(0);
    const res = await put();
    expect(res.status).toBe(404);
    expect(m.transaction).not.toHaveBeenCalled();
  });
});
