import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const findMany = vi.fn();
const resolveInspectionReach = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: { jobAppointment: { findMany: (...a: unknown[]) => findMany(...a) } },
}));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  resolveInspectionReach: (...a: unknown[]) => resolveInspectionReach(...a),
}));

import { GET } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "u1" } });
  resolveInspectionReach.mockResolvedValue({
    ok: true,
    data: { AND: [{ OR: [{ userId: "u1" }] }] },
  });
  findMany.mockResolvedValue([]);
});

describe("GET /api/operations/appointments-calendar", () => {
  it("requires from and to", async () => {
    const req = new NextRequest(
      "http://localhost/api/operations/appointments-calendar",
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns scheduled visits in range", async () => {
    findMany.mockResolvedValue([
      {
        id: "ap1",
        title: "Site visit",
        startsAt: new Date("2026-10-15T09:00:00Z"),
        endsAt: new Date("2026-10-15T11:00:00Z"),
        status: "SCHEDULED",
        inspection: {
          id: "insp1",
          inspectionNumber: "NIR-1",
          propertyAddress: "1 Test St",
          status: "DRAFT",
        },
      },
    ]);
    const req = new NextRequest(
      "http://localhost/api/operations/appointments-calendar?from=2026-10-01&to=2026-10-31",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(1);
    expect(json.data[0].inspectionId).toBe("insp1");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { not: "CANCELLED" },
        }),
      }),
    );
  });
});
