import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// RA-6949 — the per-job Pulse toggle rides the existing inspection PATCH idiom.
const getServerSession = vi.fn();
const resolveInspectionWrite = vi.fn();
const inspectionUpdate = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: vi.fn(),
  resolveInspectionWrite: (...args: unknown[]) =>
    resolveInspectionWrite(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { update: (...args: unknown[]) => inspectionUpdate(...args) },
  },
}));

import { PATCH } from "../route";

function patch(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/inspections/insp_1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ id: "insp_1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  resolveInspectionWrite.mockResolvedValue({
    ok: true,
    data: { inspectionWhere: { id: "insp_1" } },
  });
  inspectionUpdate.mockResolvedValue({ id: "insp_1" });
});

describe("PATCH /api/inspections/[id] — pulseEnabled toggle", () => {
  it("enables Pulse for the job", async () => {
    const res = await PATCH(patch({ pulseEnabled: true }), ctx);
    expect(res.status).toBe(200);
    expect(inspectionUpdate).toHaveBeenCalledWith({
      where: { id: "insp_1" },
      data: { pulseEnabled: true },
    });
  });

  it("disables Pulse for the job (mid-dispute kill switch)", async () => {
    const res = await PATCH(patch({ pulseEnabled: false }), ctx);
    expect(res.status).toBe(200);
    expect(inspectionUpdate).toHaveBeenCalledWith({
      where: { id: "insp_1" },
      data: { pulseEnabled: false },
    });
  });

  it("ignores a non-boolean pulseEnabled and updates nothing", async () => {
    const res = await PATCH(patch({ pulseEnabled: "yes" }), ctx);
    expect(res.status).toBe(400);
    expect(inspectionUpdate).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await PATCH(patch({ pulseEnabled: true }), ctx);
    expect(res.status).toBe(401);
    expect(inspectionUpdate).not.toHaveBeenCalled();
  });
});
