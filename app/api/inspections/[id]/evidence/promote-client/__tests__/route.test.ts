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

  // RA-7090 round 3 MUST-FIX: this is the FOURTH EvidenceItem writer. Three
  // consecutive review rounds found a writer reaching the dangerous state
  // simply by not calling a shared control, and this one passed through
  // NEITHER the sanitiser nor the signing policy.
  describe("RA-7090: the shared controls apply to this writer too", () => {
    function onePending() {
      p.clientEvidenceSubmission.findMany.mockResolvedValue([
        {
          id: "s_1",
          description: "Water damage",
          fileUrl: "ws/insp/a.jpg",
          fileName: "a.jpg",
          fileMimeType: "image/jpeg",
          fileSizeBytes: 1024,
          submittedAt: new Date("2026-06-09"),
        },
      ]);
    }

    it("stamps every promoted row signedManifestVerified:false", async () => {
      onePending();
      await POST(req(), params);
      const structured = JSON.parse(
        p.evidenceItem.create.mock.calls[0][0].data.structuredData,
      );
      expect(structured.signedManifestVerified).toBe(false);
      expect(structured.c2paManifest).toBeUndefined();
    });

    it("records WHY the row is unsigned — the exemption is explicit, not implied", async () => {
      onePending();
      await POST(req(), params);
      const structured = JSON.parse(
        p.evidenceItem.create.mock.calls[0][0].data.structuredData,
      );
      expect(structured.signedManifestDowngradeReason).toBe(
        "CLIENT_PORTAL_PROMOTION_UNSIGNED_BY_DESIGN",
      );
    });

    it("stays EXEMPT with the policy ON — client uploads can never carry a technician's signature", async () => {
      process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST = "true";
      try {
        onePending();
        const res = await POST(req(), params);
        // Refusing here would block staff from accepting legitimate client
        // evidence while proving nothing about its origin.
        expect(res.status).toBe(200);
        expect(p.evidenceItem.create).toHaveBeenCalledTimes(1);
        const structured = JSON.parse(
          p.evidenceItem.create.mock.calls[0][0].data.structuredData,
        );
        expect(structured.signedManifestVerified).toBe(false);
        expect(structured.signedManifestDowngradeReason).toBe(
          "CLIENT_PORTAL_PROMOTION_UNSIGNED_BY_DESIGN",
        );
      } finally {
        delete process.env.EVIDENCE_REQUIRE_SIGNED_MANIFEST;
      }
    });
  });
});
