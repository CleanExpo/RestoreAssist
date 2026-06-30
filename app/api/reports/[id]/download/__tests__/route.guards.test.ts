import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// STORM T4 — report PDF download guards (Marcus). Pairs with the client fix
// that now surfaces a failed download. Locks the server contract: auth,
// active-subscription entitlement, and tenant-scoped ownership — the failures
// the UI must report instead of silently swallowing.

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const userFindUnique = vi.fn();
const reportFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    report: { findFirst: (...a: unknown[]) => reportFindFirst(...a) },
    scope: { findFirst: vi.fn() },
    estimate: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/api-errors", () => ({
  apiError: (_req: unknown, opts: { message: string; status: number }) =>
    new Response(JSON.stringify({ error: opts.message }), {
      status: opts.status,
      headers: { "content-type": "application/json" },
    }),
  fromException: () =>
    new Response(JSON.stringify({ error: "server" }), { status: 500 }),
}));

import { GET } from "../route";

const req = () => new NextRequest("http://localhost/api/reports/r_1/download");
const ctx = { params: Promise.resolve({ id: "r_1" }) };

beforeEach(() => {
  getServerSession.mockReset();
  userFindUnique.mockReset();
  reportFindFirst.mockReset();
});

describe("GET /api/reports/[id]/download", () => {
  it("returns 401 when unauthenticated", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const res = await GET(req(), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the session user no longer exists", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    userFindUnique.mockResolvedValueOnce(null);
    const res = await GET(req(), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 402 when the subscription is not active", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    userFindUnique.mockResolvedValueOnce({ id: "u_1", subscriptionStatus: "EXPIRED" });
    const res = await GET(req(), ctx);
    expect(res.status).toBe(402);
  });

  it("returns 404 (tenant-scoped) when the report is not the caller's", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    userFindUnique.mockResolvedValueOnce({ id: "u_1", subscriptionStatus: "ACTIVE" });
    reportFindFirst.mockResolvedValueOnce(null);
    const res = await GET(req(), ctx);
    expect(res.status).toBe(404);
    // Ownership is enforced in the query, not post-hoc.
    expect(reportFindFirst.mock.calls[0][0].where).toMatchObject({
      id: "r_1",
      userId: "u_1",
    });
  });
});
