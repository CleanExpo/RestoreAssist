import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// RA-6800: resending (extending) an invite must re-assert that the invite's
// creator is in the caller's org, in the write `where`, not just a prior check.

const getServerSession = vi.fn();
const inviteFindUnique = vi.fn();
const inviteUpdate = vi.fn();
const userFindUnique = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/email", () => ({ sendInviteEmail: vi.fn() }));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    _req: unknown,
    _uid: string,
    cb: () => Promise<Response>,
  ) => cb(),
}));
vi.mock("@/lib/api-errors", () => ({
  apiError: (_r: unknown, o: { message: string; status: number }) =>
    Response.json({ error: o.message }, { status: o.status }),
  fromException: () => Response.json({ error: "server" }, { status: 500 }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    userInvite: {
      findUnique: (...a: unknown[]) => inviteFindUnique(...a),
      update: (...a: unknown[]) => inviteUpdate(...a),
    },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
  },
}));

import { POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({
    user: { id: "admin1", role: "ADMIN", organizationId: "org1" },
  });
  // Expired invite created by someone in the caller's org → triggers the extend.
  inviteFindUnique.mockResolvedValue({
    id: "inv1",
    email: "e@x.com",
    usedAt: null,
    expiresAt: new Date(Date.now() - 1000),
    createdById: "admin1",
    createdBy: { id: "admin1", name: "Admin", organizationId: "org1" },
    organization: { name: "Org" },
  });
  inviteUpdate.mockResolvedValue({ id: "inv1" });
  userFindUnique.mockResolvedValue({ name: "Admin" });
});

describe("POST /api/team/invites/[id]/resend — org-scoped extend", () => {
  it("scopes the expiry extension to invites created within the caller's org", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/team/invites/inv1/resend", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "inv1" }) },
    );
    expect(inviteUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inv1", createdBy: { organizationId: "org1" } },
      }),
    );
    expect(res.status).toBeLessThan(400);
  });
});
