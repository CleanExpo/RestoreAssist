/**
 * Guard: anonymous /api/health must not name missing environment variables.
 * Release verification keeps what it reads publicly (status, deploymentSha,
 * checks.*.status); the variable names are for a platform operator only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.hoisted(() => vi.fn());
const verifyAdminFromDb = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/admin-auth", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/admin-auth")>("@/lib/admin-auth");
  return {
    verifyAdminFromDb: (...a: unknown[]) => verifyAdminFromDb(...a),
    verifyPlatformSupportOperator: actual.verifyPlatformSupportOperator,
  };
});
vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]) },
}));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/env-check", () => ({
  getEnvStatus: () => ({
    missingRequired: ["RA_PLANTED_SECRET_NAME"],
    missingRecommended: ["RA_PLANTED_OTHER_NAME"],
  }),
}));

import { GET } from "../route";

const get = () => new NextRequest("http://localhost/api/health");

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PLATFORM_SUPPORT_USER_IDS = "staff-1";
  process.env.GIT_SHA = "a".repeat(40);
});

describe("GET /api/health", () => {
  it("anonymous callers get no environment variable names", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await GET(get());
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("RA_PLANTED");
    expect(text).not.toContain("missing");
  });

  it("anonymous callers still get what release verification reads", async () => {
    getServerSession.mockResolvedValue(null);
    const body = await (await GET(get())).json();
    expect(body.deploymentSha).toBe("a".repeat(40));
    expect(body.checks.database.status).toBe("ok");
    expect(body.checks.env.status).toBe("error");
  });

  it("a business-owner ADMIN who is not a platform operator gets no names", async () => {
    getServerSession.mockResolvedValue({ user: { id: "owner-1" } });
    verifyAdminFromDb.mockResolvedValue({
      user: { id: "owner-1", role: "ADMIN", organizationId: "o" },
    });
    const text = JSON.stringify(await (await GET(get())).json());
    expect(text).not.toContain("RA_PLANTED");
  });

  it("a platform operator gets the names", async () => {
    getServerSession.mockResolvedValue({ user: { id: "staff-1" } });
    verifyAdminFromDb.mockResolvedValue({
      user: { id: "staff-1", role: "ADMIN", organizationId: "o" },
    });
    const body = await (await GET(get())).json();
    expect(body.checks.env.missing).toEqual(["RA_PLANTED_SECRET_NAME"]);
  });
});
