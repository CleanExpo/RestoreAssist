import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// RA-6800: ending an impersonation session must scope the write to the
// originating admin atomically (updateMany { id, adminUserId } + count check),
// so the row can only be ended by its owner and a stale row yields a clean 404.

const getServerSession = vi.fn();
const verifyAdminFromDb = vi.fn();
const impFindUnique = vi.fn();
const impUpdateMany = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/csrf", () => ({ validateCsrf: () => null }));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({
  verifyAdminFromDb: (...a: unknown[]) => verifyAdminFromDb(...a),
}));
vi.mock("@/lib/api-errors", () => ({
  apiError: (_r: unknown, o: { message: string; status: number }) =>
    Response.json({ error: o.message }, { status: o.status }),
  fromException: () => Response.json({ error: "server" }, { status: 500 }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminImpersonation: {
      findUnique: (...a: unknown[]) => impFindUnique(...a),
      update: vi.fn(),
      updateMany: (...a: unknown[]) => impUpdateMany(...a),
    },
  },
}));

import { POST } from "../route";

const prev = process.env.ENABLE_ADMIN_IMPERSONATION;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.ENABLE_ADMIN_IMPERSONATION = "true";
  getServerSession.mockResolvedValue({ user: { id: "admin1" } });
  verifyAdminFromDb.mockResolvedValue({
    response: null,
    user: { id: "admin1", role: "ADMIN" },
  });
  impFindUnique.mockResolvedValue({
    id: "imp1",
    adminUserId: "admin1",
    endedAt: null,
  });
});
afterEach(() => {
  process.env.ENABLE_ADMIN_IMPERSONATION = prev;
});

function post() {
  return POST(
    new NextRequest("http://localhost/api/admin/impersonate/stop", {
      method: "POST",
      body: JSON.stringify({ jti: "tok1" }),
    }),
  );
}

describe("POST /api/admin/impersonate/stop — owner-scoped write", () => {
  it("ends the session via updateMany scoped to the originating admin", async () => {
    impUpdateMany.mockResolvedValue({ count: 1 });
    const res = await post();
    expect(res.status).toBe(200);
    expect(impUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "imp1", adminUserId: "admin1" },
      }),
    );
  });

  it("404s when the scoped write matches nothing (row vanished / not owned)", async () => {
    impUpdateMany.mockResolvedValue({ count: 0 });
    const res = await post();
    expect(res.status).toBe(404);
  });
});
