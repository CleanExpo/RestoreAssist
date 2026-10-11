/**
 * D-028 — the assigned technician deletes nothing through the Category /
 * Class panel.
 *
 * Clearing the pick on a DRAFT deletes the reviewed Classification row, and
 * that row may be the owner's (job page, draft save). For the technician the
 * panel record still saves, but the Classification row is left as it is; for
 * the owner the clear behaves as before (RA-7709).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  session: vi.fn(),
  gate: vi.fn(),
  inspectionFindFirst: vi.fn(),
  wdcFindUnique: vi.fn(),
  wdcUpsert: vi.fn(),
  inspectionUpdate: vi.fn(),
  classificationDeleteMany: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: m.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({ assertInspectionAssignedWrite: m.gate }));
vi.mock("@/lib/nir-classification-persist", () => ({
  persistInspectionClassification: vi.fn(),
}));
vi.mock("@/lib/prisma", () => {
  const tx = {
    waterDamageClassification: { findUnique: m.wdcFindUnique, upsert: m.wdcUpsert },
    inspection: { update: m.inspectionUpdate },
    classification: { deleteMany: m.classificationDeleteMany },
  };
  return {
    prisma: {
      inspection: { findFirst: m.inspectionFindFirst },
      $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  };
});

import { POST } from "../route";

const SCOPE = { id: "insp-1", technicianId: "tech-1", user: { organizationId: "org-1" } };

function grant(viaAssignment: boolean) {
  m.gate.mockResolvedValue({
    ok: true,
    data: {
      inspectionWhere: SCOPE,
      inspectionManyWhere: SCOPE,
      childInspectionFilter: { technicianId: "tech-1", user: { organizationId: "org-1" } },
      viaAssignment,
    },
  });
}

const clearPick = () =>
  POST(
    new NextRequest("http://localhost/api/inspections/insp-1/water-damage-classification", {
      method: "POST",
      body: JSON.stringify({ waterCategory: null, damageClass: null }),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id: "insp-1" }) },
  );

beforeEach(() => {
  vi.resetAllMocks();
  m.inspectionFindFirst.mockResolvedValue({ id: "insp-1", status: "DRAFT", _count: { photos: 0 } });
  // The panel had a pick; the request clears it.
  m.wdcFindUnique.mockResolvedValue({ waterCategory: "CAT_2", damageClass: "CLASS_2" });
  m.wdcUpsert.mockResolvedValue({ inspectionId: "insp-1", waterCategory: null, damageClass: null });
  m.inspectionUpdate.mockResolvedValue({});
  m.classificationDeleteMany.mockResolvedValue({ count: 1 });
});

describe("water-damage-classification POST clearing the pick (D-028)", () => {
  it("the assigned technician's clear saves the panel but deletes no Classification row", async () => {
    m.session.mockResolvedValue({ user: { id: "tech-1" } });
    grant(true);
    const res = await clearPick();
    expect(res.status, await res.clone().text()).toBe(200);
    expect(m.wdcUpsert).toHaveBeenCalledTimes(1);
    expect(m.classificationDeleteMany).not.toHaveBeenCalled();
  });

  it("the owner's clear still removes the reviewed pick (RA-7709 unchanged)", async () => {
    m.session.mockResolvedValue({ user: { id: "owner-1" } });
    grant(false);
    const res = await clearPick();
    expect(res.status).toBe(200);
    expect(m.classificationDeleteMany).toHaveBeenCalledWith({
      where: { inspectionId: "insp-1", reviewedBy: { not: null } },
    });
  });
});
