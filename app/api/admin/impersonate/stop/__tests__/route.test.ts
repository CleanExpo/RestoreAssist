/**
 * RA-7598 — POST /api/admin/impersonate/stop must be platform-staff
 * gated *before* ENABLE_ADMIN_IMPERSONATION.
 *
 * Pair with RA-7592 / #2221 (start) and RA-7594 / #2223 (log). The
 * impersonation triad is start / stop / log. Start already calls
 * verifyPlatformSupportOperator after verifyAdminFromDb. Stop was still
 * ADMIN + flag only.
 *
 * `role: "ADMIN"` is every self-registered owner. A tenant ADMIN who
 * minted (or somehow holds) a jti must not poke the half-built surface
 * once the flag wakes up. The originating-admin owner check stays; it
 * is not a substitute for the staff allowlist.
 *
 * CLEAR bar: tenant ADMIN → 403/404; no impersonation findUnique /
 * updateMany; planted markers absent from body and headers. Empty or
 * wrong PLATFORM_SUPPORT_USER_IDS fails closed. Watch the control fail
 * first on the unfixed route.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const impFindUnique = vi.fn();
const impUpdateMany = vi.fn();
const applyRateLimit = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/csrf", () => ({ validateCsrf: () => null }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimit(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
    },
    adminImpersonation: {
      findUnique: (...args: unknown[]) => impFindUnique(...args),
      update: vi.fn(),
      updateMany: (...args: unknown[]) => impUpdateMany(...args),
    },
  },
}));

import { POST } from "../route";

const TENANT_ADMIN = "admin-tenant-ra7598";
const OTHER_ADMIN = "admin-other-ra7598";
const PLANTED_ROW_ID = "imp-foreign-ra7598";
const PLANTED_JTI = "jti-planted-ra7598";
const FOREIGN_EMAIL_TARGET = "victim@tenant-b.example";

const FOREIGN_MARKERS = [
  FOREIGN_EMAIL_TARGET,
  OTHER_ADMIN,
  PLANTED_ROW_ID,
  PLANTED_JTI,
];

const plantedOwnRow = {
  id: PLANTED_ROW_ID,
  adminUserId: TENANT_ADMIN,
  endedAt: null,
  targetEmail: FOREIGN_EMAIL_TARGET,
};

function post(jti = "tok1") {
  return POST(
    new NextRequest("http://localhost/api/admin/impersonate/stop", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jti }),
    }),
  );
}

function signInAdmin(id: string) {
  getServerSession.mockResolvedValue({
    user: { id, role: "ADMIN" },
  });
  userFindUnique.mockResolvedValue({
    id,
    role: "ADMIN",
    organizationId: "org-tenant-ra7598",
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
  impFindUnique.mockReset();
  impUpdateMany.mockReset();
  applyRateLimit.mockReset();
  applyRateLimit.mockResolvedValue(null);
  impFindUnique.mockResolvedValue(plantedOwnRow);
  impUpdateMany.mockResolvedValue({ count: 1 });
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/admin/impersonate/stop (RA-7598)", () => {
  it("refuses a tenant ADMIN even when the impersonation flag is on", async () => {
    signInAdmin(TENANT_ADMIN);
    vi.stubEnv("ENABLE_ADMIN_IMPERSONATION", "true");
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "");

    const res = await post(PLANTED_JTI);
    const body = await res.json();

    expect([403, 404]).toContain(res.status);
    expect(impFindUnique).not.toHaveBeenCalled();
    expect(impUpdateMany).not.toHaveBeenCalled();
    expect(typeof body.error === "string" ? body.error : body.error?.message).toBe(
      "Forbidden",
    );
    await assertNoForeignLeak(res, body);
    expect(userFindUnique).toHaveBeenCalledTimes(1);
    expect(userFindUnique).toHaveBeenCalledWith({
      where: { id: TENANT_ADMIN },
      select: { id: true, role: true, organizationId: true },
    });
  });

  it("fails closed when PLATFORM_SUPPORT_USER_IDS lists someone else", async () => {
    signInAdmin(TENANT_ADMIN);
    vi.stubEnv("ENABLE_ADMIN_IMPERSONATION", "true");
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "different_user");

    const res = await post(PLANTED_JTI);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(impFindUnique).not.toHaveBeenCalled();
    expect(impUpdateMany).not.toHaveBeenCalled();
    await assertNoForeignLeak(res, body);
  });

  it("refuses a tenant ADMIN with 403 (not 501) when the flag is off — allowlist first", async () => {
    signInAdmin(TENANT_ADMIN);
    vi.stubEnv("ENABLE_ADMIN_IMPERSONATION", "false");
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "");

    const res = await post(PLANTED_JTI);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.code).not.toBe("FEATURE_DISABLED");
    expect(impFindUnique).not.toHaveBeenCalled();
    expect(impUpdateMany).not.toHaveBeenCalled();
    await assertNoForeignLeak(res, body);
  });

  it("returns 501 for an allowlisted operator while the flag is off — never a write", async () => {
    signInAdmin(TENANT_ADMIN);
    vi.stubEnv("ENABLE_ADMIN_IMPERSONATION", "false");
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", TENANT_ADMIN);

    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(501);
    expect(body.code).toBe("FEATURE_DISABLED");
    expect(impFindUnique).not.toHaveBeenCalled();
    expect(impUpdateMany).not.toHaveBeenCalled();
  });

  it("ends the session only for an allowlisted operator when the flag is on", async () => {
    signInAdmin(TENANT_ADMIN);
    vi.stubEnv("ENABLE_ADMIN_IMPERSONATION", "true");
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", ` other_user, ${TENANT_ADMIN} `);

    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(impFindUnique).toHaveBeenCalledTimes(1);
    expect(impUpdateMany).toHaveBeenCalledTimes(1);
    expect(impUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PLANTED_ROW_ID, adminUserId: TENANT_ADMIN },
      }),
    );
  });
});

describe("POST /api/admin/impersonate/stop — owner-scoped write", () => {
  beforeEach(() => {
    signInAdmin(TENANT_ADMIN);
    vi.stubEnv("ENABLE_ADMIN_IMPERSONATION", "true");
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", TENANT_ADMIN);
  });

  it("ends the session via updateMany scoped to the originating admin", async () => {
    impUpdateMany.mockResolvedValue({ count: 1 });
    const res = await post();
    expect(res.status).toBe(200);
    expect(impUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PLANTED_ROW_ID, adminUserId: TENANT_ADMIN },
      }),
    );
  });

  it("404s when the scoped write matches nothing (row vanished / not owned)", async () => {
    impUpdateMany.mockResolvedValue({ count: 0 });
    const res = await post();
    expect(res.status).toBe(404);
  });

  it("refuses an allowlisted operator who did not start the session", async () => {
    impFindUnique.mockResolvedValue({
      id: PLANTED_ROW_ID,
      adminUserId: OTHER_ADMIN,
      endedAt: null,
    });

    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(impUpdateMany).not.toHaveBeenCalled();
    expect(body.error).toBe("Only the originating admin can end this session");
  });
});
