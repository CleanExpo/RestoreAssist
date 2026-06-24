import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: vi.fn(async () => ({ ok: true })),
  resolveInspectionWrite: vi.fn(),
}));
vi.mock("@prisma/client", () => ({ Prisma: { DbNull: "__DbNull__" } }));
vi.mock("@/lib/prisma", () => ({
  prisma: { claimSketch: { findMany: vi.fn(), update: vi.fn() } },
}));

import { getServerSession } from "next-auth";
import {
  assertInspectionTenancy,
  resolveInspectionWrite,
} from "@/lib/auth/assert-tenancy";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

const mSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const mTenancy = assertInspectionTenancy as unknown as ReturnType<typeof vi.fn>;
const mResolve = resolveInspectionWrite as unknown as ReturnType<typeof vi.fn>;
const OK_WRITE = {
  ok: true as const,
  data: {
    inspectionWhere: { id: "i1" },
    inspectionManyWhere: { id: "i1" },
    childInspectionFilter: undefined,
  },
};
const p = prisma as unknown as {
  claimSketch: {
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  mSession.mockResolvedValue({ user: { id: "u_1" } });
  mTenancy.mockResolvedValue({ ok: true });
  mResolve.mockResolvedValue(OK_WRITE);
  p.claimSketch.update.mockResolvedValue({});
});

const req = () =>
  new NextRequest(
    "http://localhost/api/inspections/i1/sketches/promote-homeowner",
    { method: "POST" },
  );
const params = { params: Promise.resolve({ id: "i1" }) };

describe("POST promote-homeowner", () => {
  it("401 without a session", async () => {
    mSession.mockResolvedValueOnce(null);
    expect((await POST(req(), params)).status).toBe(401);
  });

  it("403 when tenancy fails", async () => {
    mResolve.mockResolvedValueOnce({ ok: false, status: 403, reason: "no" });
    expect((await POST(req(), params)).status).toBe(403);
  });

  it("promotes pending capture into sketchData and clears the sidecar", async () => {
    p.claimSketch.findMany.mockResolvedValue([
      {
        id: "cs_1",
        pendingHomeownerCapture: {
          sketchData: { objects: [1] },
          moisturePoints: [{ wme: 20 }],
          country: "NZ",
        },
      },
      { id: "cs_2", pendingHomeownerCapture: null }, // skipped
    ]);
    const res = await POST(req(), params);
    expect(res.status).toBe(200);
    expect((await res.json()).data.promoted).toBe(1);
    expect(p.claimSketch.update).toHaveBeenCalledTimes(1);
    const arg = p.claimSketch.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "cs_1" });
    expect(arg.data.sketchData).toEqual({ objects: [1] });
    expect(arg.data.country).toBe("NZ");
    expect(arg.data.pendingHomeownerCapture).toBe("__DbNull__"); // cleared
  });

  it("promotes nothing when there are no pending submissions", async () => {
    p.claimSketch.findMany.mockResolvedValue([
      { id: "cs_1", pendingHomeownerCapture: null },
    ]);
    const res = await POST(req(), params);
    expect((await res.json()).data.promoted).toBe(0);
    expect(p.claimSketch.update).not.toHaveBeenCalled();
  });
});
