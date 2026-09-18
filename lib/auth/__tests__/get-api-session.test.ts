import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const getServerSession = vi.fn();
const getToken = vi.fn();

vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => getServerSession(...args) }));
vi.mock("next-auth/jwt", () => ({ getToken: (...args: unknown[]) => getToken(...args) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getApiSession } from "../get-api-session";

describe("getApiSession", () => {
  beforeEach(() => {
    getServerSession.mockReset();
    getToken.mockReset();
  });

  it("returns getServerSession when user.id is present", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1" } });
    const session = await getApiSession({} as NextRequest);
    expect(session?.user?.id).toBe("u1");
    expect(getToken).not.toHaveBeenCalled();
  });

  it("reads the request JWT when getServerSession has no user.id", async () => {
    getServerSession.mockResolvedValue({ user: { email: "pat@example.com" } });
    getToken.mockResolvedValue({ sub: "u2", email: "pat@example.com", role: "ADMIN" });
    const session = await getApiSession({} as NextRequest);
    expect(session?.user?.id).toBe("u2");
    expect(session?.user?.role).toBe("ADMIN");
  });

  it("does not invent a user from a revoked token", async () => {
    getServerSession.mockResolvedValue(null);
    getToken.mockResolvedValue({ sub: "u2", revoked: true });
    const session = await getApiSession({} as NextRequest);
    expect(session).toBeNull();
  });
});
