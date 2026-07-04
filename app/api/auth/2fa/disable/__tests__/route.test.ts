/**
 * RA-6966 — POST /api/auth/2fa/disable behavioural tests.
 *
 * Mocks only session/prisma/csrf/rate-limiter. bcrypt runs REAL (unmocked)
 * so "wrong password" is a genuine bcrypt.compare rejection, not a stubbed
 * always-true/always-false.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

const getServerSession = vi.fn();
const applyRateLimit = vi.fn();
const userFindUnique = vi.fn();
const userUpdate = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn(() => null) }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimit(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
      update: (...args: unknown[]) => userUpdate(...args),
    },
  },
}));

import { POST } from "../route";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/auth/2fa/disable", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const PASSWORD = "correct horse battery staple 12";
// Low bcrypt cost — this is a test fixture password, not a real secret.
const passwordHash = bcrypt.hashSync(PASSWORD, 4);

beforeEach(() => {
  getServerSession.mockReset();
  applyRateLimit.mockReset();
  userFindUnique.mockReset();
  userUpdate.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "u1" } });
  applyRateLimit.mockResolvedValue(null); // not rate-limited
  userUpdate.mockResolvedValue({});
});

describe("POST /api/auth/2fa/disable", () => {
  it("401 when there is no session", async () => {
    getServerSession.mockResolvedValue(null);

    const res = await POST(makeRequest({ currentPassword: PASSWORD }));

    expect(res.status).toBe(401);
  });

  it("rate-limits per user (session.user.id), not per IP", async () => {
    userFindUnique.mockResolvedValue({ password: passwordHash });

    await POST(makeRequest({ currentPassword: PASSWORD }));

    expect(applyRateLimit).toHaveBeenCalledTimes(1);
    const opts = applyRateLimit.mock.calls[0][1] as { key?: string };
    expect(opts.key).toBe("u1");
  });

  it("400 when currentPassword is missing", async () => {
    const res = await POST(makeRequest({}));

    expect(res.status).toBe(400);
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("400 when the account has no password on file (OAuth-only user)", async () => {
    userFindUnique.mockResolvedValue({ password: null });

    const res = await POST(makeRequest({ currentPassword: PASSWORD }));

    expect(res.status).toBe(400);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("400 on a wrong password (real bcrypt.compare rejects it)", async () => {
    userFindUnique.mockResolvedValue({ password: passwordHash });

    const res = await POST(
      makeRequest({ currentPassword: "totally-wrong-password" }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION");
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("200 on the correct password: disables 2FA and clears the secret", async () => {
    userFindUnique.mockResolvedValue({ password: passwordHash });

    const res = await POST(makeRequest({ currentPassword: PASSWORD }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorEnabledAt: null,
      },
    });
  });
});
