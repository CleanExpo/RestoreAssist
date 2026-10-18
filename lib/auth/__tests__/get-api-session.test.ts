import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { getServerSession, getToken } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  getToken: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("next-auth/jwt", () => ({ getToken }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getApiSession } from "@/lib/auth/get-api-session";

const req = { headers: new Headers() } as NextRequest;

beforeEach(() => {
  getServerSession.mockReset();
  getToken.mockReset();
});

describe("getApiSession", () => {
  it("returns getServerSession when user.id is present", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1", email: "a@b.c" } });

    await expect(getApiSession(req)).resolves.toEqual({
      user: { id: "u1", email: "a@b.c" },
    });
    expect(getToken).not.toHaveBeenCalled();
  });

  it("reads JWT sub from the request when getServerSession has no id", async () => {
    getServerSession.mockResolvedValue({ user: { email: "a@b.c" } });
    getToken.mockResolvedValue({
      sub: "u2",
      email: "a@b.c",
      role: "ADMIN",
      customExp: Math.floor(Date.now() / 1000) + 3600,
    });

    await expect(getApiSession(req)).resolves.toEqual({
      user: { id: "u2", email: "a@b.c", name: undefined, role: "ADMIN" },
    });
  });

  // The session() callback strips these tokens; the fallback must not bring
  // them back (a deleted account's old token would otherwise outlive its
  // ACCOUNT_DELETED tombstone and be recreated by GET /api/user/profile).
  it.each([
    ["past customExp", { customExp: Math.floor(Date.now() / 1000) - 1 }],
    ["no customExp", {}],
    ["revoked", { customExp: Math.floor(Date.now() / 1000) + 3600, revoked: true }],
  ])("does not fall back to a JWT that is %s", async (_label, extra) => {
    getServerSession.mockResolvedValue({ user: { email: "a@b.c" } });
    getToken.mockResolvedValue({ sub: "u3", email: "a@b.c", ...extra });

    await expect(getApiSession(req)).resolves.toEqual({
      user: { email: "a@b.c" },
    });
  });

  it("returns the empty session when neither path has a sub", async () => {
    getServerSession.mockResolvedValue(null);
    getToken.mockResolvedValue(null);

    await expect(getApiSession(req)).resolves.toBeNull();
  });
});
