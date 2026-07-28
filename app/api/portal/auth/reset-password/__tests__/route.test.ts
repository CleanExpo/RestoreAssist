import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  generateResetCode: vi.fn(),
  storeClientResetCode: vi.fn(),
  verifyClientResetCode: vi.fn(),
  bcryptHash: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clientUser: { findUnique: mocks.findUnique, update: mocks.update },
  },
}));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn().mockReturnValue(null) }));
vi.mock("@/lib/email", () => ({
  sendPasswordResetEmail: mocks.sendPasswordResetEmail,
}));
vi.mock("@/lib/password-reset-store", () => ({
  generateResetCode: mocks.generateResetCode,
  storeClientResetCode: mocks.storeClientResetCode,
  verifyClientResetCode: mocks.verifyClientResetCode,
}));
vi.mock("@/lib/auth/password-breach", () => ({
  rejectIfBreached: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/portal/client-jwt", () => ({
  signClientPortalJwt: vi.fn().mockResolvedValue("portal-token"),
}));
vi.mock("bcryptjs", () => ({ default: { hash: mocks.bcryptHash } }));

import { POST } from "../route";

const clientUser = {
  id: "client-user-1",
  email: "homeowner@example.com",
  name: "Home Owner",
  clientId: "client-1",
};

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/portal/auth/reset-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUnique.mockResolvedValue(clientUser);
  mocks.update.mockResolvedValue({});
  mocks.sendPasswordResetEmail.mockResolvedValue(null);
  mocks.generateResetCode.mockReturnValue("123456");
  mocks.storeClientResetCode.mockResolvedValue(undefined);
  mocks.verifyClientResetCode.mockResolvedValue({ valid: true });
  mocks.bcryptHash.mockResolvedValue("hashed-password");
});

describe("POST /api/portal/auth/reset-password", () => {
  it("returns the same generic response for known and unknown emails", async () => {
    const known = await POST(makeRequest({ email: clientUser.email }));

    mocks.findUnique.mockResolvedValueOnce(null);
    const unknown = await POST(makeRequest({ email: "unknown@example.com" }));

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(await known.json()).toEqual(await unknown.json());
    expect(mocks.storeClientResetCode).toHaveBeenCalledTimes(1);
    expect(mocks.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  });

  it("rejects a password change without an emailed verification code", async () => {
    const response = await POST(
      makeRequest({
        email: clientUser.email,
        password: "a-new-password-that-is-long-enough",
        confirmPassword: "a-new-password-that-is-long-enough",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Invalid or expired verification code.",
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("requires the code before changing the client password", async () => {
    mocks.verifyClientResetCode.mockResolvedValueOnce({
      valid: false,
      error: "Invalid or expired verification code.",
    });

    const response = await POST(
      makeRequest({
        email: clientUser.email,
        code: "000000",
        password: "a-new-password-that-is-long-enough",
        confirmPassword: "a-new-password-that-is-long-enough",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("hashes and updates the password after a valid emailed code", async () => {
    const response = await POST(
      makeRequest({
        email: clientUser.email,
        code: "123456",
        password: "a-new-password-that-is-long-enough",
        confirmPassword: "a-new-password-that-is-long-enough",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ token: "portal-token" });
    expect(mocks.verifyClientResetCode).toHaveBeenCalledWith(
      clientUser.id,
      clientUser.email,
      "123456",
    );
    expect(mocks.bcryptHash).toHaveBeenCalledWith(
      "a-new-password-that-is-long-enough",
      12,
    );
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: clientUser.id },
      data: {
        passwordHash: "hashed-password",
        mustChangePassword: false,
        lastLoginAt: expect.any(Date),
      },
    });
  });
});
