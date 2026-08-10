import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/portal/lookup-portal-account", () => ({
  lookupPortalAccount: vi.fn(),
}));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn() }));
vi.mock("@/lib/auth/botid", () => ({ verifyBotId: vi.fn() }));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn(() => null) }));
const uploadMock = vi.fn();
vi.mock("@/lib/storage", () => ({
  getStorageProvider: async () => ({
    upload: (...a: unknown[]) => uploadMock(...a),
  }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findFirst: vi.fn() },
    clientEvidenceSubmission: { create: vi.fn() },
  },
}));

import { lookupPortalAccount } from "@/lib/portal/lookup-portal-account";
import { applyRateLimit } from "@/lib/rate-limiter";
import { verifyBotId } from "@/lib/auth/botid";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

const mLookup = lookupPortalAccount as unknown as ReturnType<typeof vi.fn>;
const mRate = applyRateLimit as unknown as ReturnType<typeof vi.fn>;
const mBot = verifyBotId as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  inspection: { findFirst: ReturnType<typeof vi.fn> };
  clientEvidenceSubmission: { create: ReturnType<typeof vi.fn> };
};

const jpeg = `data:image/jpeg;base64,${Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(20),
]).toString("base64")}`;

beforeEach(() => {
  vi.clearAllMocks();
  mRate.mockResolvedValue(null);
  mBot.mockResolvedValue({ ok: true });
  mLookup.mockResolvedValue({ clientId: "c_1" });
  p.inspection.findFirst.mockResolvedValue({
    id: "insp_1",
    workspaceId: "ws_1",
    userId: "u_1",
  });
  p.clientEvidenceSubmission.create.mockResolvedValue({ id: "ces_1" });
  uploadMock.mockResolvedValue({
    storagePath: "client-evidence-quarantine/ws_1/insp_1/x",
    originalUrl: "https://res.cloudinary.com/demo/image/upload/x.jpg",
    sizeBytes: 24,
  });
});

const post = (body: unknown) =>
  new NextRequest("http://localhost/api/portal/tok/evidence", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const params = { params: Promise.resolve({ token: "tok" }) };

describe("POST /api/portal/[token]/evidence", () => {
  it("404 on an invalid/expired link", async () => {
    mLookup.mockResolvedValueOnce(null);
    expect((await POST(post({ description: "x" }), params)).status).toBe(404);
  });

  it("uploads an image to Cloudinary quarantine (from token's client)", async () => {
    const res = await POST(
      post({ description: "Kitchen damp", images: [jpeg] }),
      params,
    );
    expect(res.status).toBe(200);
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(uploadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "ws_1",
        inspectionId: "insp_1",
        originalsOnly: true,
      }),
    );
    expect(p.clientEvidenceSubmission.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        inspectionId: "insp_1",
        description: "Kitchen damp",
        fileUrl: "https://res.cloudinary.com/demo/image/upload/x.jpg",
      }),
    });
  });

  it("accepts description-only with no images", async () => {
    const res = await POST(post({ description: "Call me" }), params);
    expect(res.status).toBe(200);
    expect(uploadMock).not.toHaveBeenCalled();
    expect(p.clientEvidenceSubmission.create).toHaveBeenCalledWith({
      data: { inspectionId: "insp_1", description: "Call me" },
    });
  });
});
