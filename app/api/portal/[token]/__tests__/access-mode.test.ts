/**
 * RA-7634 (RA-7616 A5) — a portal link with no expiry is VIEW-ONLY.
 *
 * `ClientPortalAccount.expiresAt = null` marks a grandfathered link that was
 * issued before links carried an expiry. It must keep showing the client their
 * claim, but it must not hand out signing tokens (authorities) or accept
 * uploads (evidence). Only a link with an expiry (every link issued or re-sent
 * through the "Send to client" button) is INTERACTIVE.
 *
 * Nothing here mocks `lookupPortalAccount`: the database row is the only
 * input, so the real lookup derives `accessMode` and the real routes act on it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/auth/botid", () => ({
  verifyBotId: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn(() => null) }));
const uploadMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/storage", () => ({
  getStorageProvider: async () => ({
    upload: (...a: unknown[]) => uploadMock(...a),
  }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    clientPortalAccount: { findFirst: vi.fn(), update: vi.fn() },
    authorityFormInstance: { findMany: vi.fn() },
    inspection: { findFirst: vi.fn() },
    clientEvidenceSubmission: { create: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { lookupPortalAccount } from "@/lib/portal/lookup-portal-account";
import { GET as authoritiesGet } from "../authorities/route";
import { POST as evidencePost } from "../evidence/route";

const p = prisma as unknown as {
  clientPortalAccount: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  authorityFormInstance: { findMany: ReturnType<typeof vi.fn> };
  inspection: { findFirst: ReturnType<typeof vi.fn> };
  clientEvidenceSubmission: { create: ReturnType<typeof vi.fn> };
};

const NO_EXPIRY_ROW = {
  id: "cpa_legacy",
  clientId: "c_1",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  tokenRotatedAt: null,
  expiresAt: null,
};
const WITH_EXPIRY_ROW = {
  ...NO_EXPIRY_ROW,
  id: "cpa_current",
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
};

beforeEach(() => {
  vi.clearAllMocks();
  p.clientPortalAccount.update.mockResolvedValue({});
  p.authorityFormInstance.findMany.mockResolvedValue([
    {
      id: "afi_1",
      status: "PENDING_SIGNATURES",
      authorityDescription: "Authority to commence work",
      template: { name: "Authority to Commence Work" },
      signatures: [
        { signatureRequestToken: "11111111-1111-4111-8111-111111111111" },
      ],
    },
  ]);
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

const params = { params: Promise.resolve({ token: "tok" }) };
const getAuthorities = () =>
  authoritiesGet(
    new NextRequest("http://localhost/api/portal/tok/authorities"),
    params,
  );
const postEvidence = () =>
  evidencePost(
    new NextRequest("http://localhost/api/portal/tok/evidence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description: "Water under the kitchen sink" }),
    }),
    params,
  );

describe("portal link with NO expiry (grandfathered) is READ_ONLY", () => {
  beforeEach(() => {
    p.clientPortalAccount.findFirst.mockResolvedValue(NO_EXPIRY_ROW);
  });

  it("still resolves (the client can view the claim) but as READ_ONLY", async () => {
    const account = await lookupPortalAccount("tok");
    expect(account).not.toBeNull();
    expect(account?.clientId).toBe("c_1");
    expect(account?.accessMode).toBe("READ_ONLY");
  });

  it("authorities returns 404 and never reads the signing tokens", async () => {
    const res = await getAuthorities();
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toContain(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(p.authorityFormInstance.findMany).not.toHaveBeenCalled();
  });

  it("evidence returns 404 and writes nothing", async () => {
    const res = await postEvidence();
    expect(res.status).toBe(404);
    expect(p.inspection.findFirst).not.toHaveBeenCalled();
    expect(p.clientEvidenceSubmission.create).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
  });
});

describe("portal link WITH an expiry is INTERACTIVE", () => {
  beforeEach(() => {
    p.clientPortalAccount.findFirst.mockResolvedValue(WITH_EXPIRY_ROW);
  });

  it("resolves as INTERACTIVE", async () => {
    const account = await lookupPortalAccount("tok");
    expect(account?.accessMode).toBe("INTERACTIVE");
  });

  it("authorities still lists the pending approvals with their sign token", async () => {
    const res = await getAuthorities();
    expect(res.status).toBe(200);
    const { authorities } = (await res.json()).data;
    expect(authorities).toEqual([
      expect.objectContaining({
        id: "afi_1",
        signToken: "11111111-1111-4111-8111-111111111111",
      }),
    ]);
  });

  it("evidence still accepts a submission", async () => {
    const res = await postEvidence();
    expect(res.status).toBe(200);
    expect(p.clientEvidenceSubmission.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        inspectionId: "insp_1",
        description: "Water under the kitchen sink",
      }),
    });
  });
});
