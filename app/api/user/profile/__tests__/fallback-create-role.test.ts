/**
 * GET /api/user/profile creates the row for a signed-in user who has none.
 * That account owns its workspace, so it must be ADMIN like every signup path:
 * financial writes (assertFinancialWriter) refuse role USER. An email with an
 * open invite stays USER, as register refuses that email for the same reason.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getApiSession = vi.fn();
const userFindUnique = vi.fn();
const userCreate = vi.fn();
const inviteFindFirst = vi.fn();
const securityEventFindFirst = vi.fn();

vi.mock("@/lib/auth/get-api-session", () => ({
  getApiSession: (...a: unknown[]) => getApiSession(...a),
}));
vi.mock("@/lib/stripe", () => ({
  stripe: { customers: { create: vi.fn().mockResolvedValue({ id: "cus_1" }) } },
}));
vi.mock("@/lib/trial-handling", () => ({
  getTrialStatus: vi.fn().mockResolvedValue(null),
  checkAndUpdateTrialStatus: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      create: (...a: unknown[]) => userCreate(...a),
    },
    userInvite: {
      findFirst: (...a: unknown[]) => inviteFindFirst(...a),
    },
    securityEvent: {
      findFirst: (...a: unknown[]) => securityEventFindFirst(...a),
    },
  },
}));

const { GET } = await import("../route");

beforeEach(() => {
  vi.clearAllMocks();
  getApiSession.mockResolvedValue({
    user: { id: "u_new", email: "new@example.com", name: "New", image: null },
  });
  userFindUnique.mockResolvedValue(null);
  userCreate.mockResolvedValue({ id: "u_new", email: "new@example.com" });
  securityEventFindFirst.mockResolvedValue(null);
});

async function createdRole() {
  await GET(new NextRequest("http://localhost/api/user/profile"));
  expect(userCreate).toHaveBeenCalledTimes(1);
  return userCreate.mock.calls[0][0].data.role;
}

describe("GET /api/user/profile fallback create", () => {
  it("creates a self-serve account as ADMIN", async () => {
    inviteFindFirst.mockResolvedValue(null);
    expect(await createdRole()).toBe("ADMIN");
  });

  it("keeps an email with an open invite as USER", async () => {
    inviteFindFirst.mockResolvedValue({ id: "inv_1" });
    expect(await createdRole()).toBe("USER");
    expect(inviteFindFirst.mock.calls[0][0].where).toMatchObject({
      email: { equals: "new@example.com", mode: "insensitive" },
      usedAt: null,
    });
  });

  it("refuses to recreate a deleted account from its surviving session", async () => {
    inviteFindFirst.mockResolvedValue(null);
    securityEventFindFirst.mockResolvedValue({ id: "se_1" });
    const res = await GET(new NextRequest("http://localhost/api/user/profile"));
    expect(res.status).toBe(401);
    expect(userCreate).not.toHaveBeenCalled();
    expect(securityEventFindFirst.mock.calls[0][0].where).toEqual({
      userId: "u_new",
      eventType: "ACCOUNT_DELETED",
    });
  });
});
