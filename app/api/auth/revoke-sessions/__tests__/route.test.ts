import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.hoisted(() => vi.fn());
const validateCsrf = vi.hoisted(() => vi.fn());
const applyRateLimit = vi.hoisted(() => vi.fn());
const logSecurityEvent = vi.hoisted(() => vi.fn());
const verifyAdminFromDb = vi.hoisted(() => vi.fn());
const userFindFirst = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/csrf", () => ({ validateCsrf }));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit }));
vi.mock("@/lib/security-audit", () => ({ logSecurityEvent }));

// adminUserScope stays REAL. Mocking it is what let the org-less fallback go
// unexercised and a P0 reach review.
vi.mock("@/lib/admin-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin-auth")>();
  return { ...actual, verifyAdminFromDb };
});

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findFirst: userFindFirst } },
}));

import { POST } from "../route";

/** Both users exist; only the query's constraints decide reachability. */
const USERS: Array<{ id: string; organizationId: string | null }> = [
  { id: "user-B", organizationId: "org-B" },
  { id: "admin-A", organizationId: null },
];

type Clause = { id?: string; organizationId?: string | null };

function rowMatches(
  row: { id: string; organizationId: string | null },
  clause: Clause,
): boolean {
  if (clause.id !== undefined && clause.id !== row.id) return false;
  if (
    clause.organizationId !== undefined &&
    clause.organizationId !== row.organizationId
  ) {
    return false;
  }
  return true;
}

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/auth/revoke-sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  validateCsrf.mockReturnValue(null);
  applyRateLimit.mockResolvedValue(null);
  logSecurityEvent.mockResolvedValue(undefined);
  getServerSession.mockResolvedValue({ user: { id: "admin-A" } });
  verifyAdminFromDb.mockResolvedValue({
    response: null,
    user: { id: "admin-A", role: "ADMIN", organizationId: "org-A" },
  });
  userFindFirst.mockImplementation(
    (args: { where?: { AND?: Clause[] } & Clause }) => {
      const where = args?.where ?? {};
      const clauses: Clause[] = Array.isArray(where.AND) ? where.AND : [where];
      const row = USERS.find((candidate) =>
        clauses.every((clause) => rowMatches(candidate, clause)),
      );
      return Promise.resolve(row ? { id: row.id } : null);
    },
  );
});

describe("POST /api/auth/revoke-sessions", () => {
  it("refuses to revoke a user outside the caller's organisation", async () => {
    const response = await POST(request({ targetUserId: "user-B" }));

    // 404 rather than 403 so a caller cannot probe which ids exist elsewhere.
    expect(response.status).toBe(404);
    expect(logSecurityEvent).not.toHaveBeenCalled();
  });

  it("refuses an ORG-LESS admin instead of matching them against themselves", async () => {
    // adminUserScope returns {id: "admin-A"} with no organisation. Spread over
    // `id: requestedTarget` that replaces the target with the caller, the
    // lookup succeeds and the route reports a successful revoke it never
    // performed against the requested account.
    verifyAdminFromDb.mockResolvedValue({
      response: null,
      user: { id: "admin-A", role: "ADMIN", organizationId: null },
    });

    const response = await POST(request({ targetUserId: "user-B" }));

    expect(response.status).toBe(404);
    expect(logSecurityEvent).not.toHaveBeenCalled();
  });

  it("still lets any signed-in user revoke their own sessions", async () => {
    const response = await POST(request({ targetUserId: "admin-A" }));

    expect(response.status).toBe(200);
    expect(userFindFirst).not.toHaveBeenCalled();
    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "SESSIONS_REVOKED",
        userId: "admin-A",
      }),
    );
  });

  it("revokes a user inside the caller's own organisation", async () => {
    verifyAdminFromDb.mockResolvedValue({
      response: null,
      user: { id: "admin-A", role: "ADMIN", organizationId: "org-B" },
    });

    const response = await POST(request({ targetUserId: "user-B" }));

    expect(response.status).toBe(200);
    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "SESSIONS_REVOKED",
        userId: "user-B",
      }),
    );
  });
});
