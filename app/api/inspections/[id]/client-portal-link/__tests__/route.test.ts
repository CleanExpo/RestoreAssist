import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/email-send", () => ({ sendEmail: vi.fn(async () => "msg_portal_1") }));
vi.mock("@/lib/app-url", () => ({
  getAppUrl: vi.fn(() => "https://restoreassist.app"),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: vi.fn() },
    clientPortalAccount: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(async () => ({ id: "audit_1" })),
      findFirst: vi.fn(),
    },
    authorityFormSignature: { updateMany: vi.fn(async () => ({ count: 0 })) },
    // The route's transactions run against the same mocked client.
    $transaction: vi.fn(),
  },
}));

import { getServerSession } from "next-auth";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { sendEmail } from "@/lib/email-send";
import { prisma } from "@/lib/prisma";
import { portalRecipientHash as recipientHash } from "@/lib/portal/portal-recipient-hash";
import { DELETE, POST } from "../route";

const mSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const mTenancy = assertInspectionTenancy as unknown as ReturnType<typeof vi.fn>;
const mEmail = sendEmail as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  inspection: { findUnique: ReturnType<typeof vi.fn> };
  clientPortalAccount: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  auditLog: {
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
  authorityFormSignature: { updateMany: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

const emailedAudit = (email: string) => ({
  changes: JSON.stringify({ channel: "email", recipientHash: recipientHash(email) }),
});

beforeEach(() => {
  vi.clearAllMocks();
  mSession.mockResolvedValue({ user: { id: "u_1" } });
  mTenancy.mockResolvedValue({ ok: true });
  p.inspection.findUnique.mockResolvedValue({
    propertyAddress: "12 Test St",
    inspectionNumber: "INSP-1",
    report: { client: { id: "c_1", email: "client@x.com", name: "Sam" } },
    user: { businessName: "Acme Restore", organization: { name: "Acme Restore" } },
  });
  p.clientPortalAccount.findFirst.mockResolvedValue(null);
  p.clientPortalAccount.create.mockResolvedValue({ token: "NEWTOK" });
  p.clientPortalAccount.update.mockResolvedValue({ token: "ROTATEDTOK" });
  p.clientPortalAccount.findMany.mockResolvedValue([]);
  p.clientPortalAccount.updateMany.mockResolvedValue({ count: 0 });
  p.auditLog.findFirst.mockResolvedValue(null);
  p.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn(prisma),
  );
});

const req = () =>
  new NextRequest("http://localhost/api/inspections/i1/client-portal-link", {
    method: "POST",
    // RA-7634: a forged Origin must not steer the emailed link; the URL comes
    // from the configured app URL.
    headers: { origin: "https://attacker.example" },
  });
const params = { params: Promise.resolve({ id: "i1" }) };

describe("POST /api/inspections/[id]/client-portal-link", () => {
  it("401 without a session", async () => {
    mSession.mockResolvedValueOnce(null);
    expect((await POST(req(), params)).status).toBe(401);
  });

  it("403 when tenancy fails", async () => {
    mTenancy.mockResolvedValueOnce({ ok: false, status: 403, reason: "no" });
    expect((await POST(req(), params)).status).toBe(403);
  });

  it("422 when the claim's client has no email", async () => {
    p.inspection.findUnique.mockResolvedValueOnce({
      report: { client: { id: "c_1", email: null } },
    });
    expect((await POST(req(), params)).status).toBe(422);
    expect(mEmail).not.toHaveBeenCalled();
  });

  it.each([
    "sample.client@example.com.au",
    "spine@example.com",
    "ext-1-xero-2@client.local",
  ])("refuses demo or reserved recipient %s before mint, send, or audit", async (email) => {
    p.inspection.findUnique.mockResolvedValueOnce({
      report: { client: { id: "c_1", email, name: "Sample" } },
    });

    const res = await POST(req(), params);
    expect(res.status).toBe(422);
    expect(mEmail).not.toHaveBeenCalled();
    expect(p.clientPortalAccount.findFirst).not.toHaveBeenCalled();
    expect(p.clientPortalAccount.create).not.toHaveBeenCalled();
    expect(p.clientPortalAccount.update).not.toHaveBeenCalled();
    expect(p.auditLog.create).not.toHaveBeenCalled();
  });

  it("uses inspection.client when report has no client (P3 spine)", async () => {
    p.inspection.findUnique.mockResolvedValueOnce({
      clientId: "c_spine",
      client: { id: "c_spine", email: "spine@restoreassist.com.au" },
      report: { client: null },
    });
    const res = await POST(req(), params);
    expect(res.status).toBe(200);
    expect(mEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "spine@restoreassist.com.au" }),
    );
  });

  it("mints a token, emails the /portal link, returns it", async () => {
    const res = await POST(req(), params);
    expect(res.status).toBe(200);
    expect(p.clientPortalAccount.create).toHaveBeenCalled();
    const body = await res.json();
    expect(body.data.url).toBe("https://restoreassist.app/portal/NEWTOK");
    expect(body.data.emailed).toBe(true);
    expect(body.data.expiresAt).toEqual(expect.any(String));
    expect(mEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "client@x.com",
        subject: expect.stringContaining("Acme Restore"),
      }),
    );
    expect(p.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CLIENT_PORTAL_LINK_EMAILED",
        }),
      }),
    );
  });

  it("reuses the live token when it was last emailed to the same address", async () => {
    p.clientPortalAccount.findFirst.mockResolvedValueOnce({ id: "a1", token: "OLDTOK" });
    p.auditLog.findFirst.mockResolvedValueOnce(emailedAudit("Client@X.com "));
    const res = await POST(req(), params);
    expect(p.clientPortalAccount.create).not.toHaveBeenCalled();
    expect((await res.json()).data.url).toBe(
      "https://restoreassist.app/portal/OLDTOK",
    );
  });

  // RA-8587 AC3: the old link may be with the wrong person.
  it("rotates the token when the client's email changed since the last send", async () => {
    p.clientPortalAccount.findFirst.mockResolvedValueOnce({ id: "a1", token: "OLDTOK" });
    p.auditLog.findFirst.mockResolvedValueOnce(emailedAudit("wrong@person.com"));
    const res = await POST(req(), params);
    const url = (await res.json()).data.url;
    expect(url).not.toContain("OLDTOK");
    expect(url).toBe("https://restoreassist.app/portal/ROTATEDTOK");
    expect(p.clientPortalAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "a1" },
        data: expect.objectContaining({ token: expect.any(String) }),
      }),
    );
    // RA-7634: signing links the old portal link disclosed are cleared too.
    expect(p.authorityFormSignature.updateMany).toHaveBeenCalled();
  });

  it("rotates the token when no previous recipient was recorded", async () => {
    p.clientPortalAccount.findFirst.mockResolvedValueOnce({ id: "a1", token: "OLDTOK" });
    const res = await POST(req(), params);
    expect((await res.json()).data.url).not.toContain("OLDTOK");
  });

  it("records a hash of the recipient address, not the address", async () => {
    await POST(req(), params);
    const changes = p.auditLog.create.mock.calls[0][0].data.changes as string;
    expect(JSON.parse(changes).recipientHash).toBe(recipientHash("client@x.com"));
    expect(changes).not.toContain("client@x.com");
  });

  it("does not claim the client was emailed without a provider receipt", async () => {
    mEmail.mockResolvedValueOnce(null);
    const res = await POST(req(), params);

    expect(res.status).toBe(200);
    expect((await res.json()).data.emailed).toBe(false);
  });
});

// RA-8587 AC1/AC2/AC4: switch-off uses the same gate as send, this job only.
describe("DELETE /api/inspections/[id]/client-portal-link", () => {
  const del = () =>
    new NextRequest("http://localhost/api/inspections/i1/client-portal-link", {
      method: "DELETE",
    });

  it("401 without a session", async () => {
    mSession.mockResolvedValueOnce(null);
    expect((await DELETE(del(), params)).status).toBe(401);
    expect(p.clientPortalAccount.updateMany).not.toHaveBeenCalled();
  });

  it("403 when tenancy fails, and revokes nothing", async () => {
    mTenancy.mockResolvedValueOnce({ ok: false, status: 403, reason: "no" });
    expect((await DELETE(del(), params)).status).toBe(403);
    expect(p.clientPortalAccount.updateMany).not.toHaveBeenCalled();
  });

  it("revokes only this job's live links and clears their signing links", async () => {
    p.clientPortalAccount.findMany.mockResolvedValueOnce([
      { id: "a1", clientId: "c_1" },
    ]);
    const res = await DELETE(del(), params);
    expect(res.status).toBe(200);
    expect((await res.json()).data.revoked).toBe(1);
    expect(p.clientPortalAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { inspectionId: "i1", revokedAt: null },
      }),
    );
    expect(p.clientPortalAccount.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["a1"] }, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      }),
    );
    expect(p.authorityFormSignature.updateMany).toHaveBeenCalled();
    expect(p.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CLIENT_PORTAL_ACCOUNT_REVOKED",
          entityId: "a1",
        }),
      }),
    );
  });

  it("returns revoked 0 when no live link exists", async () => {
    const res = await DELETE(del(), params);
    expect((await res.json()).data.revoked).toBe(0);
    expect(p.clientPortalAccount.updateMany).not.toHaveBeenCalled();
  });
});
