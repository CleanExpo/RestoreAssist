import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/portal/lookup-portal-account", () => ({
  lookupPortalAccount: vi.fn(),
}));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn() }));
vi.mock("@/lib/auth/botid", () => ({ verifyBotId: vi.fn() }));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn(() => null) }));
const uploadMock = vi.fn();
vi.mock("@/lib/storage/supabase-provider", () => ({
  SupabaseStorageProvider: class {
    upload = uploadMock;
  },
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
    storagePath: "ws_1/insp_1/x.jpg",
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

  it("uploads an image to the quarantine table (storagePath, from token's client)", async () => {
    const res = await POST(
      post({ description: "Kitchen damp", images: [jpeg] }),
      params,
    );
    expect(res.status).toBe(200);
    expect(uploadMock).toHaveBeenCalledTimes(1);
    // inspection resolved from the token's client, not any body id
    expect(p.inspection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { report: { clientId: "c_1" } } }),
    );
    const data = p.clientEvidenceSubmission.create.mock.calls[0][0].data;
    expect(data.inspectionId).toBe("insp_1");
    expect(data.fileUrl).toBe("ws_1/insp_1/x.jpg");
    expect(data.description).toBe("Kitchen damp");
  });

  it("ignores a client-supplied inspectionId (no IDOR)", async () => {
    await POST(post({ inspectionId: "evil", images: [jpeg] }), params);
    expect(p.inspection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { report: { clientId: "c_1" } } }),
    );
  });

  it("allows a description-only submission (no upload)", async () => {
    const res = await POST(post({ description: "Please call me" }), params);
    expect(res.status).toBe(200);
    expect(uploadMock).not.toHaveBeenCalled();
    expect(p.clientEvidenceSubmission.create).toHaveBeenCalledTimes(1);
  });

  it("422 on a non-image / mislabelled payload", async () => {
    const fake = `data:image/jpeg;base64,${Buffer.from("not an image").toString("base64")}`;
    expect((await POST(post({ images: [fake] }), params)).status).toBe(422);
    expect(p.clientEvidenceSubmission.create).not.toHaveBeenCalled();
  });

  it("413 when too many images", async () => {
    const res = await POST(post({ images: new Array(11).fill(jpeg) }), params);
    expect(res.status).toBe(413);
  });

  it("422 when nothing is submitted", async () => {
    expect((await POST(post({}), params)).status).toBe(422);
  });

  it("403 bot / 429 rate-limited short-circuit before lookup", async () => {
    mBot.mockResolvedValueOnce({ ok: false, reason: "bot" });
    expect((await POST(post({ description: "x" }), params)).status).toBe(403);

    mRate.mockResolvedValueOnce(
      new Response(null, { status: 429 }) as unknown as Response,
    );
    expect((await POST(post({ description: "x" }), params)).status).toBe(429);
  });
});
