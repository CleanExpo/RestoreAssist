/**
 * RA-6966 — POST /api/auth/reset-password behavioural tests.
 *
 * Covers the core state-changing path: an invalid/expired code must not
 * touch the password, a weak new password is rejected before the code is
 * even checked... no — checked after (matches route order: length check
 * runs before verifyResetCode), and a valid code + strong password
 * actually updates the stored (bcrypt-hashed) password and clears
 * mustChangePassword.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const applyRateLimit = vi.fn();
const verifyBotId = vi.fn();
const rejectIfBreached = vi.fn();
const verifyResetCode = vi.fn();
const userFindUnique = vi.fn();
const userUpdate = vi.fn();
const bcryptHash = vi.fn().mockResolvedValue("new-hashed-password");
const logSecurityEvent = vi.fn();

vi.mock("bcryptjs", () => ({
  default: { hash: (...args: unknown[]) => bcryptHash(...args) },
}));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimit(...args),
}));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn(() => null) }));
vi.mock("@/lib/auth/botid", () => ({
  verifyBotId: (...args: unknown[]) => verifyBotId(...args),
}));
vi.mock("@/lib/auth/password-breach", () => ({
  rejectIfBreached: (...args: unknown[]) => rejectIfBreached(...args),
}));
vi.mock("@/lib/password-reset-store", () => ({
  verifyResetCode: (...args: unknown[]) => verifyResetCode(...args),
}));
vi.mock("@/lib/security-audit", () => ({
  logSecurityEvent: (...args: unknown[]) => logSecurityEvent(...args),
  extractRequestContext: vi.fn(() => ({ ipAddress: "127.0.0.1" })),
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

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const VALID_BODY = {
  email: "jane@example.com",
  code: "123456",
  newPassword: "a-brand-new-strong-password",
};

beforeEach(() => {
  vi.clearAllMocks();
  bcryptHash.mockResolvedValue("new-hashed-password");
  applyRateLimit.mockResolvedValue(null); // not rate-limited
  verifyBotId.mockResolvedValue({ ok: true });
  rejectIfBreached.mockResolvedValue(null); // not breached
  logSecurityEvent.mockResolvedValue(undefined);
});

describe("POST /api/auth/reset-password", () => {
  it("400 + no password update when the reset code is invalid/expired", async () => {
    verifyResetCode.mockResolvedValue({
      valid: false,
      error: "Invalid or expired code",
    });

    const res = await POST(makeRequest(VALID_BODY));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.message).toContain("Invalid or expired code");
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("400 when the new password is below the 12-char floor (never reaches the code check)", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, newPassword: "short" }));

    expect(res.status).toBe(400);
    expect(verifyResetCode).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("400 + no update when the email has no matching user (defensive — code store should already guard this)", async () => {
    verifyResetCode.mockResolvedValue({ valid: true });
    userFindUnique.mockResolvedValue(null);

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(400);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("200 on a valid code + strong password: hashes and persists the new password, clears mustChangePassword", async () => {
    verifyResetCode.mockResolvedValue({ valid: true });
    userFindUnique.mockResolvedValue({ id: "user-1", email: VALID_BODY.email });
    userUpdate.mockResolvedValue({});

    const res = await POST(makeRequest(VALID_BODY));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    expect(bcryptHash).toHaveBeenCalledWith(VALID_BODY.newPassword, 12);
    expect(userUpdate).toHaveBeenCalledWith({
      where: { email: VALID_BODY.email },
      data: {
        password: "new-hashed-password",
        mustChangePassword: false,
      },
    });
  });
});
