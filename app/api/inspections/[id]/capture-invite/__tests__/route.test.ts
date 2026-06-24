import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: vi.fn(async () => ({ ok: true })),
  resolveInspectionWrite: vi.fn(),
}));
vi.mock("@/lib/capture-token", () => ({
  generateCaptureToken: vi.fn(() => ({
    token: "PLAINTOK",
    tokenHash: "hash123",
  })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { captureToken: { create: vi.fn(), updateMany: vi.fn() } },
}));

import { getServerSession } from "next-auth";
import {
  assertInspectionTenancy,
  resolveInspectionWrite,
} from "@/lib/auth/assert-tenancy";
import { prisma } from "@/lib/prisma";
import { POST, DELETE } from "../route";

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
  captureToken: {
    create: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  mSession.mockResolvedValue({ user: { id: "u_1" } });
  mTenancy.mockResolvedValue({ ok: true });
  mResolve.mockResolvedValue(OK_WRITE);
  p.captureToken.create.mockResolvedValue({ id: "ct_1" });
  p.captureToken.updateMany.mockResolvedValue({ count: 2 });
});

const req = (method: string) =>
  new NextRequest("http://localhost/api/inspections/i1/capture-invite", {
    method,
    headers: { origin: "https://restoreassist.app" },
  });
const params = { params: Promise.resolve({ id: "i1" }) };

describe("POST /capture-invite (issue token)", () => {
  it("401 without a session", async () => {
    mSession.mockResolvedValueOnce(null);
    expect((await POST(req("POST"), params)).status).toBe(401);
  });

  it("403 when tenancy fails", async () => {
    mTenancy.mockResolvedValueOnce({ ok: false, status: 403, reason: "no" });
    expect((await POST(req("POST"), params)).status).toBe(403);
  });

  it("201 issues a token, stores only the hash, returns the /capture link", async () => {
    const res = await POST(req("POST"), params);
    expect(res.status).toBe(201);
    const data = p.captureToken.create.mock.calls[0][0].data;
    expect(data.tokenHash).toBe("hash123"); // hash stored, not plaintext
    expect(data.inspectionId).toBe("i1");
    expect(data.createdByUserId).toBe("u_1");
    expect(data.expiresAt).toBeInstanceOf(Date);
    const body = await res.json();
    expect(body.data.url).toBe("https://restoreassist.app/capture/PLAINTOK");
  });
});

describe("DELETE /capture-invite (revoke)", () => {
  it("403 when tenancy fails", async () => {
    mResolve.mockResolvedValueOnce({ ok: false, status: 404, reason: "no" });
    expect((await DELETE(req("DELETE"), params)).status).toBe(404);
  });

  it("revokes all active tokens for the inspection", async () => {
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(200);
    const arg = p.captureToken.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ inspectionId: "i1", revokedAt: null });
    expect(arg.data.revokedAt).toBeInstanceOf(Date);
    expect((await res.json()).data.revoked).toBe(2);
  });
});
