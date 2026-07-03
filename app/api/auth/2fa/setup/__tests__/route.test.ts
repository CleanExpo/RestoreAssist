/**
 * RA-6966 — POST /api/auth/2fa/setup behavioural tests.
 *
 * Mocks only session/prisma/csrf (setup has no rate-limiter). The real
 * @/lib/auth/two-factor.generateSecret runs unmocked, so the response
 * actually contains a valid otpauth:// URL + QR data URI for the stored
 * secret, not a stubbed placeholder.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const userUpdate = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn(() => null) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
      update: (...args: unknown[]) => userUpdate(...args),
    },
  },
}));

import { POST } from "../route";

function makeRequest() {
  return new NextRequest("http://localhost/api/auth/2fa/setup", {
    method: "POST",
  });
}

beforeEach(() => {
  getServerSession.mockReset();
  userFindUnique.mockReset();
  userUpdate.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "u1" } });
  userUpdate.mockResolvedValue({});
});

describe("POST /api/auth/2fa/setup", () => {
  it("401 when there is no session", async () => {
    getServerSession.mockResolvedValue(null);

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("404 when the session user no longer exists", async () => {
    userFindUnique.mockResolvedValue(null);

    const res = await POST(makeRequest());

    expect(res.status).toBe(404);
  });

  it("generates a real TOTP secret, persists it, and returns otpauthUrl/qrDataUrl/manualEntryKey", async () => {
    userFindUnique.mockResolvedValue({
      id: "u1",
      email: "tech@example.com",
      twoFactorEnabled: false,
    });

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(typeof json.manualEntryKey).toBe("string");
    expect(json.manualEntryKey.length).toBeGreaterThan(0);
    expect(json.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(json.otpauthUrl).toContain(json.manualEntryKey);
    expect(json.qrDataUrl).toMatch(/^data:image\/png;base64,/);

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { twoFactorSecret: json.manualEntryKey },
    });
  });
});
