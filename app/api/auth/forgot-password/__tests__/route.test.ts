import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  storeResetCode: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  deliverEmailOnce: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: (...args: unknown[]) => h.userFindUnique(...args) } },
}));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn(() => null) }));
vi.mock("@/lib/auth/botid", () => ({ verifyBotId: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/password-reset-store", () => ({
  generateResetCode: () => "123456",
  storeResetCode: (...args: unknown[]) => h.storeResetCode(...args),
}));
vi.mock("@/lib/email", () => ({
  sendPasswordResetEmail: (...args: unknown[]) => h.sendPasswordResetEmail(...args),
}));
vi.mock("@/lib/email-delivery-ledger", () => ({
  deliverEmailOnce: (...args: unknown[]) => h.deliverEmailOnce(...args),
}));
vi.mock("@/lib/security-audit", () => ({
  extractRequestContext: () => ({}),
  logSecurityEvent: vi.fn(async () => undefined),
}));

import { POST } from "../route";
import { RESET_REQUEST_MESSAGE } from "@/lib/auth/recovery-policy";

function request() {
  return new NextRequest("http://localhost/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email: "USER@example.com" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.userFindUnique.mockResolvedValue({
    id: "user-1",
    email: "user@example.com",
    name: "User",
    password: "hash",
  });
  h.storeResetCode.mockResolvedValue({
    id: "reset-version-1",
    expiresAt: new Date("2026-08-25T10:00:00.000Z"),
  });
  h.sendPasswordResetEmail.mockResolvedValue({
    data: { id: "provider-1" },
    error: null,
    provider: "resend",
  });
  h.deliverEmailOnce.mockImplementation(async ({ send }) => {
    const result = await send();
    return { messageId: result.data.id, replayed: false, result };
  });
});

describe("POST /api/auth/forgot-password durable delivery", () => {
  it("binds the provider send to the exact reset-token version", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(h.deliverEmailOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "password-reset:reset-version-1",
        kind: "PASSWORD_RESET_CODE",
        recipient: "user@example.com",
        payloadIdentity: "reset-version-1|2026-08-25T10:00:00.000Z",
      }),
    );
    expect(h.sendPasswordResetEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        resetCode: "123456",
        idempotencyKey: "password-reset:reset-version-1",
      }),
    );
  });

  it("keeps the public response generic when durable delivery is ambiguous", async () => {
    h.deliverEmailOnce.mockRejectedValueOnce(new Error("ambiguous"));
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      message: RESET_REQUEST_MESSAGE,
    });
  });
});


it.each([null, { id: "google-only", email: "user@example.com", password: null }])("does not generate or send codes for absent and Google-only accounts", async (user) => {
  h.userFindUnique.mockResolvedValue(user);
  const res = await POST(request());
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ success: true, message: RESET_REQUEST_MESSAGE });
  expect(h.storeResetCode).not.toHaveBeenCalled();
  expect(h.deliverEmailOnce).not.toHaveBeenCalled();
});

it("returns the same public response after accepted delivery, absent account and provider failure", async () => {
  const delivered = await (await POST(request())).json();
  h.userFindUnique.mockResolvedValueOnce(null);
  const absent = await (await POST(request())).json();
  h.deliverEmailOnce.mockRejectedValueOnce(new Error("synthetic delivery failure"));
  const failed = await (await POST(request())).json();
  expect(delivered).toEqual(absent);
  expect(failed).toEqual(absent);
  expect(failed.message).not.toMatch(/has been sent/);
});
