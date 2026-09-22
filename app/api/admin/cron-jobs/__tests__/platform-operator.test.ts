/**
 * RA-7647 — manually firing a platform background job (process-emails,
 * sync-invoices, cleanup, ...) runs it for every business with CRON_SECRET.
 * That is RestoreAssist staff work; every self-signup is role ADMIN, so
 * `verifyAdminFromDb` alone let any trial business trigger platform jobs.
 * Real admin-auth helpers run.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const fetchMock = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
  },
}));

import { POST } from "../route";

function trigger() {
  return new NextRequest("http://localhost/api/admin/cron-jobs", {
    method: "POST",
    body: JSON.stringify({ jobId: "process-emails" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  getServerSession.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  userFindUnique.mockResolvedValue({
    id: "admin-1",
    role: "ADMIN",
    organizationId: "org-trial",
  });
  fetchMock.mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/admin/cron-jobs is staff-only (RA-7647)", () => {
  it("refuses a tenant ADMIN not on the staff allowlist and fires nothing", async () => {
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "someone-else");

    const res = await POST(trigger());

    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fires the job for an allowlisted staff ADMIN", async () => {
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "admin-1");

    const res = await POST(trigger());

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
