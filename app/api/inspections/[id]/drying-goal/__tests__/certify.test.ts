/**
 * D-028 — certifying the drying goal stays with the owner's reach.
 *
 * The assigned technician may record readings and evaluate the goal, but
 * marking it ACHIEVED is a certification that goes into the report. It is
 * refused for the technician, and for everyone the signatory recorded is the
 * signed-in user, never a name taken from the request body.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  session: vi.fn(),
  gate: vi.fn(),
  claim: vi.fn(),
  inspectionFindFirst: vi.fn(),
  recordFindUnique: vi.fn(),
  txUpdateMany: vi.fn(),
  txFindUnique: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: m.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionAssignedWrite: m.gate,
  // The claim is proven against Postgres elsewhere; here it either admits the
  // work (returns its result) or refuses it (null), as the real helper does.
  writeWithinInspectionScope: async (
    scope: unknown,
    data: unknown,
    work: (tx: unknown) => unknown,
  ) =>
    (await m.claim(scope, data))
      ? work({
          dryingGoalRecord: { updateMany: m.txUpdateMany, findUnique: m.txFindUnique },
        })
      : null,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findFirst: m.inspectionFindFirst },
    dryingGoalRecord: { findUnique: m.recordFindUnique },
  },
}));

import { PUT } from "../route";

const SCOPE = { id: "insp_1", technicianId: "tech_1", user: { organizationId: "org_1" } };

function grant(viaAssignment: boolean) {
  m.gate.mockResolvedValue({
    ok: true,
    data: {
      inspectionWhere: SCOPE,
      inspectionManyWhere: SCOPE,
      childInspectionFilter: { technicianId: "tech_1", user: { organizationId: "org_1" } },
      viaAssignment,
    },
  });
}

const put = (body: unknown) =>
  PUT(
    new NextRequest("http://localhost/api/inspections/insp_1/drying-goal", {
      method: "PUT",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id: "insp_1" }) },
  );

beforeEach(() => {
  vi.resetAllMocks();
  m.claim.mockResolvedValue(true);
  m.inspectionFindFirst.mockResolvedValue({
    id: "insp_1",
    moistureReadings: [
      {
        id: "r1",
        location: "Hall",
        surfaceType: "Drywall",
        moistureLevel: 5,
        recordedAt: new Date("2026-10-10T00:00:00Z"),
        createdAt: new Date("2026-10-10T00:00:00Z"),
      },
    ],
  });
  m.recordFindUnique.mockResolvedValue({
    inspectionId: "insp_1",
    goalAchieved: false,
    materialTargets: { Drywall: 20 },
    startedAt: new Date("2026-10-08T00:00:00Z"),
    iicrcReference: "IICRC S500:2021 §11.4",
  });
  m.txUpdateMany.mockResolvedValue({ count: 1 });
  m.txFindUnique.mockImplementation(async () => ({
    goalAchievedAt: new Date("2026-10-11T00:00:00Z"),
    totalDryingDays: 3,
    iicrcReference: "IICRC S500:2021 §11.4",
    signedOffBy: m.txUpdateMany.mock.calls[0]?.[0]?.data?.signedOffBy ?? null,
  }));
});

describe("drying-goal PUT certification (D-028)", () => {
  it("refuses the assigned technician when the readings would certify, and writes nothing", async () => {
    m.session.mockResolvedValue({ user: { id: "tech_1" } });
    grant(true);
    const res = await put({ signedOffBy: "Any Name" });
    expect(res.status, await res.clone().text()).toBe(403);
    expect(m.claim).not.toHaveBeenCalled();
    expect(m.txUpdateMany).not.toHaveBeenCalled();
  });

  it("the assigned technician can still evaluate a goal that is not yet met", async () => {
    m.session.mockResolvedValue({ user: { id: "tech_1" } });
    grant(true);
    m.inspectionFindFirst.mockResolvedValue({
      id: "insp_1",
      moistureReadings: [
        {
          id: "r1",
          location: "Hall",
          surfaceType: "Drywall",
          moistureLevel: 40,
          recordedAt: new Date(),
          createdAt: new Date(),
        },
      ],
    });
    const res = await put({});
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("IN_PROGRESS");
    expect(m.txUpdateMany).not.toHaveBeenCalled();
  });

  it("records the signed-in owner as signatory, never the name in the body", async () => {
    m.session.mockResolvedValue({ user: { id: "owner_1" } });
    grant(false);
    const res = await put({ signedOffBy: "Someone Else" });
    expect(res.status, await res.clone().text()).toBe(200);
    const data = m.txUpdateMany.mock.calls[0][0].data;
    expect(data.signedOffBy).toBe("owner_1");
    expect(data.signedOffAt).toBeInstanceOf(Date);
    // Only an uncertified record can be certified, inside the scoped write.
    expect(m.txUpdateMany.mock.calls[0][0].where).toEqual({
      inspectionId: "insp_1",
      goalAchieved: false,
    });
    expect(m.claim).toHaveBeenCalledWith(SCOPE, expect.anything());
  });

  it("without a sign-off request the goal is certified with no signatory", async () => {
    m.session.mockResolvedValue({ user: { id: "owner_1" } });
    grant(false);
    const res = await put({});
    expect(res.status).toBe(200);
    expect(m.txUpdateMany.mock.calls[0][0].data.signedOffBy).toBeNull();
  });

  it("a reassignment that lands before the write certifies nothing (404)", async () => {
    m.session.mockResolvedValue({ user: { id: "owner_1" } });
    grant(false);
    m.claim.mockResolvedValue(false);
    const res = await put({ signedOffBy: true });
    expect(res.status).toBe(404);
    expect(m.txUpdateMany).not.toHaveBeenCalled();
  });
});
