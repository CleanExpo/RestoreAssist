import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.hoisted(() => vi.fn());
const validateCsrf = vi.hoisted(() => vi.fn());
const applyRateLimit = vi.hoisted(() => vi.fn());
const logSecurityEvent = vi.hoisted(() => vi.fn());
const verifyAdminFromDb = vi.hoisted(() => vi.fn());
const adminUserScope = vi.hoisted(() => vi.fn());
const userFindFirst = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/csrf", () => ({ validateCsrf }));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit }));
vi.mock("@/lib/security-audit", () => ({ logSecurityEvent }));
vi.mock("@/lib/admin-auth", () => ({ verifyAdminFromDb, adminUserScope }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findFirst: userFindFirst } },
}));

import { POST } from "../route";

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
  adminUserScope.mockReturnValue({ organizationId: "org-A" });

  // Scope-sensitive on purpose, and this is the whole point of the control.
  // user-B genuinely exists; it simply belongs to another organisation. Only
  // an UNSCOPED lookup reaches it. A mock that returned null unconditionally
  // would answer 404 with or without the scope clause, so the mutant would
  // stay green and the control would be worthless.
  userFindFirst.mockImplementation((args: { where: Record<string, unknown> }) =>
    Promise.resolve(
      args?.where?.organizationId ? null : { id: args?.where?.id },
    ),
  );
});

describe("POST /api/auth/revoke-sessions", () => {
  it("refuses to revoke a user outside the caller's organisation", async () => {
    const response = await POST(request({ targetUserId: "user-B" }));

    // 404 rather than 403 so a caller cannot probe which ids exist elsewhere.
    expect(response.status).toBe(404);
    expect(logSecurityEvent).not.toHaveBeenCalled();
    expect(userFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "user-B",
          organizationId: "org-A",
        }),
      }),
    );
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
    // The reachable case, so the 404 above is known to come from the scope
    // clause and not from the route refusing every admin revoke.
    adminUserScope.mockReturnValue({});

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
