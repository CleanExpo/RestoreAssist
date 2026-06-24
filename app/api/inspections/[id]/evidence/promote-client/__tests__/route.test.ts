import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: vi.fn(async () => ({ ok: true })),
  resolveInspectionWrite: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    clientEvidenceSubmission: { findMany: vi.fn(), update: vi.fn() },
    evidenceItem: { create: vi.fn() },
    $transaction: vi.fn(async (ops: unknown) => ops),
  },
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
  clientEvidenceSubmission: {
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  evidenceItem: { create: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  mSession.mockResolvedValue({ user: { id: "u_1", name: "Pat Tech" } });
  mTenancy.mockResolvedValue({ ok: true });
  mResolve.mockResolvedValue(OK_WRITE);
  p.evidenceItem.create.mockReturnValue({ then: undefined });
  p.clientEvidenceSubmission.update.mockReturnValue({ then: undefined });
});

const req = () =>
  new NextRequest(
    "http://localhost/api/inspections/i1/evidence/promote-client",
    { method: "POST" },
  );
const params = { params: Promise.resolve({ id: "i1" }) };

describe("POST promote-client", () => {
  it("401 without a session", async () => {
    mSession.mockResolvedValueOnce(null);
    expect((await POST(req(), params)).status).toBe(401);
  });

  it("403 when tenancy fails", async () => {
    mResolve.mockResolvedValueOnce({ ok: false, status: 403, reason: "no" });
    expect((await POST(req(), params)).status).toBe(403);
  });

  it("promotes each unreviewed submission into an EvidenceItem + marks reviewed", async () => {
    p.clientEvidenceSubmission.findMany.mockResolvedValue([
      {
        id: "ces_1",
        description: "Kitchen damp",
        fileUrl: "ws/insp/a.jpg",
        fileName: "a.jpg",
        fileMimeType: "image/jpeg",
        fileSizeBytes: 10,
        submittedAt: new Date("2026-06-10"),
      },
      {
        id: "ces_2",
        description: "Please call me",
        fileUrl: null,
        submittedAt: new Date("2026-06-10"),
      },
    ]);
    const res = await POST(req(), params);
    expect(res.status).toBe(200);
    expect((await res.json()).data.promoted).toBe(2);
    expect(p.evidenceItem.create).toHaveBeenCalledTimes(2);
    const first = p.evidenceItem.create.mock.calls[0][0].data;
    expect(first.inspectionId).toBe("i1");
    expect(first.evidenceClass).toBe("PHOTO_DAMAGE"); // has a file
    expect(first.fileUrl).toBe("ws/insp/a.jpg");
    expect(first.capturedByName).toMatch(/Client \(verified by Pat Tech\)/);
    const second = p.evidenceItem.create.mock.calls[1][0].data;
    expect(second.evidenceClass).toBe("TECHNICIAN_NOTE"); // no file
    expect(p.clientEvidenceSubmission.update).toHaveBeenCalledTimes(2);
  });

  it("promotes nothing when there are no unreviewed submissions", async () => {
    p.clientEvidenceSubmission.findMany.mockResolvedValue([]);
    expect((await (await POST(req(), params)).json()).data.promoted).toBe(0);
    expect(p.evidenceItem.create).not.toHaveBeenCalled();
  });
});
