import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// RA-6800: the same-org role update in POST /api/team/invites (Case 1 — invitee
// already in the caller's org) must re-assert the org in the write `where`.

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const userUpdate = vi.fn();
const userInviteCreate = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/csrf", () => ({ validateCsrf: () => null }));
vi.mock("@/lib/sanitize", () => ({ sanitizeString: (s: string) => s }));
vi.mock("@/lib/email", () => ({ sendInviteEmail: vi.fn() }));
vi.mock("@/lib/email-retry", () => ({
  sendWithRetry: vi.fn(async (fn: () => unknown) => fn()),
}));
vi.mock("@/lib/notifications", () => ({ notifyTeamMemberJoined: vi.fn() }));
vi.mock("@/lib/api-errors", () => ({
  apiError: (_r: unknown, o: { message: string; status: number }) =>
    Response.json({ error: o.message }, { status: o.status }),
  fromException: () => Response.json({ error: "server" }, { status: 500 }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      update: (...a: unknown[]) => userUpdate(...a),
    },
    organization: { create: vi.fn() },
    userInvite: { create: (...a: unknown[]) => userInviteCreate(...a) },
  },
}));

import { POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "admin1", role: "ADMIN" } });
  // ensureOrganizationForUser(admin1) → user already has org1 (no create path).
  // existingUser lookup (by email) → a USER already in org1 (Case 1).
  userFindUnique.mockImplementation(
    ({ where }: { where: { id?: string; email?: string } }) =>
      where.id === "admin1"
        ? Promise.resolve({
            id: "admin1",
            name: "Admin",
            organizationId: "org1",
          })
        : Promise.resolve({
            id: "existing1",
            email: "e@x.com",
            name: "E",
            role: "USER",
            organizationId: "org1",
            organization: {
              id: "org1",
              name: "Org",
              owner: { id: "admin1", name: "Admin", email: "a@x.com" },
            },
          }),
  );
  userUpdate.mockResolvedValue({ id: "existing1", role: "MANAGER" });
  userInviteCreate.mockResolvedValue({ id: "inv1", token: "tok" });
});

describe("POST /api/team/invites — same-org role update (Case 1)", () => {
  it("scopes the role update to the caller's organization", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/team/invites", {
        method: "POST",
        body: JSON.stringify({ email: "e@x.com", role: "MANAGER" }),
      }),
    );
    // Primary assertion: the write re-asserts the org boundary.
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "existing1", organizationId: "org1" },
      }),
    );
    expect(res.status).toBeLessThan(400);
  });
});
