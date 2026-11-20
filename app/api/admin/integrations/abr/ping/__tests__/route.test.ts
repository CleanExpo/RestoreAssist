/**
 * GET /api/admin/integrations/abr/ping is a staff-only configuration check.
 *
 * The staff allowlist (`isPlatformSupportOperator`) is necessary but not
 * sufficient: like every app/api/admin route it must re-read the caller's
 * role from the database (`verifyAdminFromDb`), because a JWT role claim
 * outlives a demotion. Same gate as stripe-diagnostics (RA-7595).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const lookupAbn = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
  },
}));
vi.mock("@/lib/integrations/abr/client", () => ({
  lookupAbn: (...args: unknown[]) => lookupAbn(...args),
}));

import { GET } from "../route";

const OPERATOR = "operator-abr-ping";
const TENANT_ADMIN = "tenant-admin-abr-ping";

function signIn(userId: string, dbRole: string) {
  getServerSession.mockResolvedValue({ user: { id: userId, role: "ADMIN" } });
  userFindUnique.mockResolvedValue({ id: userId, role: dbRole, organizationId: "org-1" });
}

function request() {
  return new NextRequest("http://localhost/api/admin/integrations/abr/ping");
}

describe("ABR ping admin gate", () => {
  beforeEach(() => {
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", OPERATOR);
    vi.stubEnv("ABR_API_GUID", "test-guid");
    lookupAbn.mockResolvedValue({ ok: true, data: { legalName: "Probe Pty Ltd" } });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("refuses an allowlisted operator whose database role is no longer ADMIN, before any ABR call", async () => {
    signIn(OPERATOR, "USER");
    const res = await GET(request());
    expect(res.status).toBe(403);
    expect(userFindUnique).toHaveBeenCalled();
    expect(lookupAbn).not.toHaveBeenCalled();
  });

  it("refuses a tenant ADMIN who is not on the staff allowlist", async () => {
    signIn(TENANT_ADMIN, "ADMIN");
    const res = await GET(request());
    expect(res.status).toBe(403);
    expect(lookupAbn).not.toHaveBeenCalled();
  });

  it("lets an allowlisted operator with a current ADMIN role reach the ABR lookup", async () => {
    signIn(OPERATOR, "ADMIN");
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(lookupAbn).toHaveBeenCalledTimes(1);
    expect(await res.json()).toMatchObject({ ok: true, reason: "REACHABLE" });
  });
});
