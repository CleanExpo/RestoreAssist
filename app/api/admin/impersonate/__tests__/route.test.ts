/**
 * RA-7592 — POST /api/admin/impersonate must be platform-staff gated
 * *before* ENABLE_ADMIN_IMPERSONATION can ever be on.
 *
 * The endpoint is currently fail-closed on that flag (501). The dormant
 * shape is still `findUnique({ where: { id } })` with no organisation
 * predicate. A tenant ADMIN who can name any user id is the defect the
 * flag is papering over. The allowlist has to refuse them even when the
 * flag is true.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const impersonationCreate = vi.fn();
const applyRateLimit = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/csrf", () => ({ validateCsrf: () => null }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimit(...args),
  getClientIp: () => "127.0.0.1",
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
    },
    adminImpersonation: {
      create: (...args: unknown[]) => impersonationCreate(...args),
    },
  },
}));

import { POST } from "../route";

const TENANT_ADMIN = "admin-1";
const TARGET = "user-other";

function post() {
  return POST(
    new NextRequest("http://localhost/api/admin/impersonate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        targetUserId: TARGET,
        reason: "RA-7592 support ticket",
      }),
    }),
  );
}

function signInTenantAdmin() {
  getServerSession.mockResolvedValue({
    user: { id: TENANT_ADMIN, role: "ADMIN" },
  });
  userFindUnique.mockImplementation(
    (args: { where?: { id?: string }; select?: unknown }) => {
      const id = args?.where?.id;
      if (id === TENANT_ADMIN) {
        return Promise.resolve({
          id: TENANT_ADMIN,
          role: "ADMIN",
          organizationId: "org-tenant",
        });
      }
      if (id === TARGET) {
        return Promise.resolve({
          id: TARGET,
          email: "target@example.com",
        });
      }
      return Promise.resolve(null);
    },
  );
}

beforeEach(() => {
  getServerSession.mockReset();
  userFindUnique.mockReset();
  impersonationCreate.mockReset();
  applyRateLimit.mockReset();
  applyRateLimit.mockResolvedValue(null);
  impersonationCreate.mockResolvedValue({
    id: "audit-1",
    startedAt: new Date("2026-09-21T00:00:00Z"),
  });
  vi.unstubAllEnvs();
  vi.stubEnv("NEXTAUTH_SECRET", "ra-7592-test-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/admin/impersonate (RA-7592)", () => {
  it("refuses a tenant ADMIN even when the impersonation flag is on", async () => {
    signInTenantAdmin();
    vi.stubEnv("ENABLE_ADMIN_IMPERSONATION", "true");
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "");

    const res = await POST(
      new NextRequest("http://localhost/api/admin/impersonate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetUserId: TARGET,
          reason: "RA-7592 support ticket",
        }),
      }),
    );

    expect(res.status).toBe(403);
    expect(impersonationCreate).not.toHaveBeenCalled();
    expect(userFindUnique).toHaveBeenCalledTimes(1);
    expect(userFindUnique).toHaveBeenCalledWith({
      where: { id: TENANT_ADMIN },
      select: { id: true, role: true, organizationId: true },
    });
  });

  it("returns 501 for an allowlisted operator while the flag is off — never a token", async () => {
    signInTenantAdmin();
    vi.stubEnv("ENABLE_ADMIN_IMPERSONATION", "false");
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", TENANT_ADMIN);

    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(501);
    expect(body.code).toBe("FEATURE_DISABLED");
    expect(impersonationCreate).not.toHaveBeenCalled();
  });

  it("mints an audit row only for an allowlisted operator when the flag is on", async () => {
    signInTenantAdmin();
    vi.stubEnv("ENABLE_ADMIN_IMPERSONATION", "true");
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", TENANT_ADMIN);

    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.audit.id).toBe("audit-1");
    expect(body.audit.targetEmail).toBe("target@example.com");
    expect(impersonationCreate).toHaveBeenCalledTimes(1);
  });
});
