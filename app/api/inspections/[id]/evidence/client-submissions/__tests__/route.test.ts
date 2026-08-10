import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: vi.fn(async () => ({
    ok: true,
    data: { id: "i1", userId: "u_1", workspaceId: "ws_1" },
  })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { clientEvidenceSubmission: { findMany: vi.fn() } },
}));
const { getSignedUrl, signStoredMediaUrl } = vi.hoisted(() => ({
  getSignedUrl: vi.fn(),
  signStoredMediaUrl: vi.fn(async (url: string) => url),
}));
vi.mock("@/lib/storage", () => ({
  getStorageProvider: async () => ({
    getSignedUrl: (...a: unknown[]) => getSignedUrl(...a),
  }),
}));
vi.mock("@/lib/storage/sign-stored-url", () => ({
  signStoredMediaUrl: (...a: unknown[]) => signStoredMediaUrl(...a),
}));

import { getServerSession } from "next-auth";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { prisma } from "@/lib/prisma";
import { GET } from "../route";

const mSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const mTenancy = assertInspectionTenancy as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  clientEvidenceSubmission: { findMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  mSession.mockResolvedValue({ user: { id: "u_1" } });
  mTenancy.mockResolvedValue({
    ok: true,
    data: { id: "i1", userId: "u_1", workspaceId: "ws_1" },
  });
  getSignedUrl.mockResolvedValue("https://signed/view");
  signStoredMediaUrl.mockImplementation(async (url: string) => url);
  p.clientEvidenceSubmission.findMany.mockResolvedValue([]);
});

const req = () =>
  new NextRequest(
    "http://localhost/api/inspections/i1/evidence/client-submissions",
  );
const params = { params: Promise.resolve({ id: "i1" }) };

describe("GET client-submissions", () => {
  it("401 without a session", async () => {
    mSession.mockResolvedValueOnce(null);
    expect((await GET(req(), params)).status).toBe(401);
  });

  it("403 when tenancy fails", async () => {
    mTenancy.mockResolvedValueOnce({ ok: false, status: 403, reason: "no" });
    expect((await GET(req(), params)).status).toBe(403);
  });

  it("lists unreviewed submissions; CDN URLs pass through, paths are signed", async () => {
    p.clientEvidenceSubmission.findMany.mockResolvedValueOnce([
      {
        id: "ces_1",
        description: "Kitchen damp",
        fileUrl: "https://res.cloudinary.com/demo/image/upload/a.jpg",
        fileName: "a.jpg",
        fileMimeType: "image/jpeg",
        fileSizeBytes: 10,
        submittedAt: new Date("2026-06-10T00:00:00Z"),
      },
      {
        id: "ces_2",
        description: "Legacy path",
        fileUrl: "ws/insp/a.jpg",
        fileName: "a.jpg",
        fileMimeType: "image/jpeg",
        fileSizeBytes: 10,
        submittedAt: new Date("2026-06-10T00:00:00Z"),
      },
      {
        id: "ces_3",
        description: "Please call me",
        fileUrl: null,
        fileName: null,
        fileMimeType: null,
        fileSizeBytes: null,
        submittedAt: new Date("2026-06-10T00:00:00Z"),
      },
    ]);
    const res = await GET(req(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(p.clientEvidenceSubmission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { inspectionId: "i1", reviewedAt: null },
      }),
    );
    expect(body.data.submissions).toHaveLength(3);
    expect(body.data.submissions[0].viewUrl).toContain("cloudinary.com");
    expect(getSignedUrl).toHaveBeenCalledWith("ws/insp/a.jpg");
    expect(body.data.submissions[1].viewUrl).toBe("https://signed/view");
    expect(body.data.submissions[2].viewUrl).toBeNull();
  });
});
