/**
 * RA-7594 — GET /api/admin/impersonate/log must be platform-staff gated.
 *
 * `role: "ADMIN"` is every self-registered owner. verifyAdminFromDb only
 * re-checks that role. The unfixed route then findManys every
 * AdminImpersonation row and includes admin + target emails. Unlike
 * /api/admin/impersonate (start), this log is not behind
 * ENABLE_ADMIN_IMPERSONATION.
 *
 * Pair with RA-7592 / #2221: impersonation is RestoreAssist staff work,
 * not a tenant privilege. Same fail-closed allowlist
 * (`PLATFORM_SUPPORT_USER_IDS` / verifyPlatformSupportOperator).
 *
 * CLEAR bar: a tenant ADMIN is 403/404. Foreign emails and row ids must
 * be absent from the response body, headers, and error text. Watch the
 * control fail first on the unfixed route.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const impersonationFindMany = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
    },
    adminImpersonation: {
      findMany: (...args: unknown[]) => impersonationFindMany(...args),
    },
  },
}));

import { GET } from "../route";

const TENANT_ADMIN = "admin-tenant-ra7594";
const STAFF_ADMIN = "admin-staff-ra7594";
const TARGET_B = "target-b-ra7594";

const FOREIGN_EMAIL_STAFF = "staff@restoreassist.example";
const FOREIGN_EMAIL_TARGET = "victim@tenant-b.example";

const FOREIGN_MARKERS = [
  FOREIGN_EMAIL_STAFF,
  FOREIGN_EMAIL_TARGET,
  STAFF_ADMIN,
  TARGET_B,
  "imp-foreign-ra7594",
];

const plantedRow = {
  id: "imp-foreign-ra7594",
  adminUserId: STAFF_ADMIN,
  targetUserId: TARGET_B,
  reason: "support ticket RA-7594",
  startedAt: new Date("2026-09-20T00:00:00Z"),
  endedAt: null,
  admin: {
    id: STAFF_ADMIN,
    name: "Platform Staff",
    email: FOREIGN_EMAIL_STAFF,
  },
  target: {
    id: TARGET_B,
    name: "Tenant B Owner",
    email: FOREIGN_EMAIL_TARGET,
  },
};

function request(
  url = "http://localhost/api/admin/impersonate/log?limit=50",
) {
  return new NextRequest(url);
}

function signInTenantAdmin() {
  getServerSession.mockResolvedValue({
    user: { id: TENANT_ADMIN, role: "ADMIN" },
  });
  userFindUnique.mockResolvedValue({
    id: TENANT_ADMIN,
    role: "ADMIN",
    organizationId: "org-tenant-ra7594",
  });
}

async function assertNoForeignLeak(res: Response, body: unknown) {
  const serialized = JSON.stringify(body);
  const headerBlob = [...res.headers.entries()].flat().join("\n");
  for (const marker of FOREIGN_MARKERS) {
    expect(serialized).not.toContain(marker);
    expect(headerBlob).not.toContain(marker);
  }
}

beforeEach(() => {
  getServerSession.mockReset();
  userFindUnique.mockReset();
  impersonationFindMany.mockReset();
  impersonationFindMany.mockResolvedValue([plantedRow]);
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/admin/impersonate/log (RA-7594)", () => {
  it("returns 401 when there is no session", async () => {
    getServerSession.mockResolvedValue(null);

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(impersonationFindMany).not.toHaveBeenCalled();
    await assertNoForeignLeak(res, body);
  });

  it("returns 403 for a non-admin session", async () => {
    getServerSession.mockResolvedValue({
      user: { id: "user-1", role: "USER" },
    });

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(impersonationFindMany).not.toHaveBeenCalled();
    await assertNoForeignLeak(res, body);
  });

  it("refuses a tenant ADMIN even when the impersonation flag is on", async () => {
    signInTenantAdmin();
    vi.stubEnv("ENABLE_ADMIN_IMPERSONATION", "true");
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "");

    const res = await GET(request());
    const body = await res.json();

    expect([403, 404]).toContain(res.status);
    expect(impersonationFindMany).not.toHaveBeenCalled();
    expect(body.rows).toBeUndefined();
    expect(body.count).toBeUndefined();
    expect(typeof body.error === "string" ? body.error : body.error?.message).toBe(
      "Forbidden",
    );
    await assertNoForeignLeak(res, body);
    expect(userFindUnique).toHaveBeenCalledWith({
      where: { id: TENANT_ADMIN },
      select: { id: true, role: true, organizationId: true },
    });
  });

  it("fails closed when PLATFORM_SUPPORT_USER_IDS lists someone else", async () => {
    signInTenantAdmin();
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "different_user");

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(impersonationFindMany).not.toHaveBeenCalled();
    await assertNoForeignLeak(res, body);
  });

  it("returns the log only for an allowlisted platform-support operator", async () => {
    signInTenantAdmin();
    vi.stubEnv("ENABLE_ADMIN_IMPERSONATION", "false");
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", ` other_user, ${TENANT_ADMIN} `);

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].id).toBe("imp-foreign-ra7594");
    expect(body.rows[0].admin.email).toBe(FOREIGN_EMAIL_STAFF);
    expect(impersonationFindMany).toHaveBeenCalledTimes(1);
  });
});
