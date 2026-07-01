/**
 * Tests for POST /api/onboarding/account-type
 * Route: app/api/onboarding/account-type/route.ts
 *
 * RA-6793: the onboarding ABN gate must enforce the ATO mod-89 checksum
 * (not just an 11-digit length check), matching /api/user/profile. An invalid
 * ABN on a tax invoice forces the recipient to withhold 47% PAYG, so a
 * structurally-malformed ABN must be rejected at onboarding.
 *
 * Mocks session + prisma so the test runs offline (no DB / network).
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userUpdate = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { update: (...a: unknown[]) => userUpdate(...a) },
  },
}));

// Import route AFTER mocks are registered.
const { POST } = await import("../route");

// Valid ABN (passes ATO mod-89 checksum) and an invalid-checksum sibling —
// same 11 digits with the final digit bumped so the weighted sum no longer
// divides by 89.
const VALID_ABN = "53004085616"; // Telstra-style ABN, checksum-valid
const INVALID_CHECKSUM_ABN = "53004085617"; // 11 digits but wrong checksum

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/onboarding/account-type", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    businessName: "Acme Restoration Pty Ltd",
    abn: VALID_ABN,
    state: "QLD",
    acceptedTerms: true,
    ...overrides,
  };
}

beforeEach(() => {
  getServerSession.mockReset();
  userUpdate.mockReset();
  getServerSession.mockResolvedValue({ user: { id: "u_1" } });
  userUpdate.mockResolvedValue({ id: "u_1" });
});

describe("POST /api/onboarding/account-type — ABN checksum gate (RA-6793)", () => {
  it("rejects an 11-digit ABN that fails the ATO checksum", async () => {
    const res = await POST(makeReq(validBody({ abn: INVALID_CHECKSUM_ABN })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toMatch(/Invalid ABN/i);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("accepts a valid ABN and persists it", async () => {
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.ok).toBe(true);
    expect(userUpdate).toHaveBeenCalledTimes(1);
    const arg = userUpdate.mock.calls[0][0] as {
      data: { businessABN: string };
    };
    expect(arg.data.businessABN).toBe(VALID_ABN);
  });

  it("accepts a valid ABN with embedded whitespace", async () => {
    const res = await POST(makeReq(validBody({ abn: "53 004 085 616" })));
    expect(res.status).toBe(200);
    const arg = userUpdate.mock.calls[0][0] as {
      data: { businessABN: string };
    };
    // Whitespace is stripped before persistence.
    expect(arg.data.businessABN).toBe(VALID_ABN);
  });

  it("rejects when unauthenticated before touching the ABN", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(401);
    expect(userUpdate).not.toHaveBeenCalled();
  });
});
