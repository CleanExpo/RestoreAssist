/**
 * RA-6968/6939 — Stripe Customer Portal iOS Capacitor guard.
 *
 * The billing portal is an Apple guideline 3.1.1 surface (it exposes payment
 * management). Requests carrying the iOS Capacitor header must be rejected
 * with 403 BEFORE any Stripe call, exactly like the four checkout routes.
 *
 * Stripe, next-auth, Prisma, org-credits and idempotency are mocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/organization-credits", () => ({
  getOrganizationOwner: vi.fn(async () => null),
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: vi.fn(
    async (
      _req: NextRequest,
      _scope: string,
      handler: () => Promise<Response>,
    ) => handler(),
  ),
}));

const stripeMock = vi.hoisted(() => ({
  billingPortal: { sessions: { create: vi.fn() } },
}));
vi.mock("@/lib/stripe", () => ({ stripe: stripeMock }));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));

import { POST } from "../route";
import { getServerSession } from "next-auth";

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/subscription/portal", {
    method: "POST",
    headers,
  });
}

describe("POST /api/subscription/portal — iOS Capacitor guard (RA-6968)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for an iOS Capacitor request and never touches Stripe", async () => {
    const res = await POST(makeRequest({ "x-capacitor-platform": "ios" }));
    expect(res.status).toBe(403);
    expect(stripeMock.billingPortal.sessions.create).not.toHaveBeenCalled();
    // Guard must run before auth resolution.
    expect(getServerSession).not.toHaveBeenCalled();
  });

  it("does not block a non-iOS request at the guard (falls through to auth)", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null as never);
    const res = await POST(makeRequest());
    // No Capacitor header -> guard passes -> unauthenticated -> 401, not 403.
    expect(res.status).toBe(401);
    expect(stripeMock.billingPortal.sessions.create).not.toHaveBeenCalled();
  });
});
