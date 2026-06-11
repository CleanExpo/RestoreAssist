import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/email-send", () => ({ sendEmail: vi.fn(async () => {}) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: vi.fn() },
    clientPortalAccount: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { sendEmail } from "@/lib/email-send";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

const mSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const mTenancy = assertInspectionTenancy as unknown as ReturnType<typeof vi.fn>;
const mEmail = sendEmail as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  inspection: { findUnique: ReturnType<typeof vi.fn> };
  clientPortalAccount: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  mSession.mockResolvedValue({ user: { id: "u_1" } });
  mTenancy.mockResolvedValue({ ok: true });
  p.inspection.findUnique.mockResolvedValue({
    report: { client: { id: "c_1", email: "client@x.com" } },
  });
  p.clientPortalAccount.findFirst.mockResolvedValue(null);
  p.clientPortalAccount.create.mockResolvedValue({ token: "NEWTOK" });
});

const req = () =>
  new NextRequest("http://localhost/api/inspections/i1/client-portal-link", {
    method: "POST",
    headers: { origin: "https://restoreassist.app" },
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

  it("mints a token, emails the /portal link, returns it", async () => {
    const res = await POST(req(), params);
    expect(res.status).toBe(200);
    expect(p.clientPortalAccount.create).toHaveBeenCalled();
    const body = await res.json();
    expect(body.data.url).toBe("https://restoreassist.app/portal/NEWTOK");
    expect(body.data.emailed).toBe(true);
    expect(mEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "client@x.com" }),
    );
  });

  it("reuses an existing active token instead of minting a new one", async () => {
    p.clientPortalAccount.findFirst.mockResolvedValueOnce({ token: "OLDTOK" });
    const res = await POST(req(), params);
    expect(p.clientPortalAccount.create).not.toHaveBeenCalled();
    expect((await res.json()).data.url).toBe(
      "https://restoreassist.app/portal/OLDTOK",
    );
  });
});
