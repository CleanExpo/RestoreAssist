/**
 * RA-7647 — portal content defaults to scope PLATFORM_DEFAULT, which
 * lib/portal/fetch-portal-content.ts serves to every homeowner portal.
 * Publishing it is RestoreAssist staff work; every self-signup is role ADMIN,
 * so `verifyAdminFromDb` alone let any trial business publish onto every
 * customer's portal. Real admin-auth helpers run.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const contentFindMany = vi.fn();
const contentCreate = vi.fn();
const contentUpdate = vi.fn();
const contentDelete = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    portalContent: {
      findMany: (...args: unknown[]) => contentFindMany(...args),
      create: (...args: unknown[]) => contentCreate(...args),
      update: (...args: unknown[]) => contentUpdate(...args),
      delete: (...args: unknown[]) => contentDelete(...args),
    },
  },
}));

import { GET, POST } from "../route";
import { PATCH, DELETE } from "../[id]/route";

const ctx = { params: Promise.resolve({ id: "content_1" }) };
const article = {
  slug: "mould-after-a-flood",
  category: "guides",
  mdxContent: "# Anything the author likes",
  state: "PUBLISHED",
};

function send(method: string, url: string, payload?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
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
  contentFindMany.mockResolvedValue([]);
  contentCreate.mockResolvedValue({ id: "content_new", ...article });
  contentUpdate.mockResolvedValue({ id: "content_1", ...article });
  contentDelete.mockResolvedValue({ id: "content_1" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("platform portal content is staff-only (RA-7647)", () => {
  describe("a tenant ADMIN not on the staff allowlist", () => {
    beforeEach(() => {
      vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "someone-else");
    });

    it("cannot list portal content", async () => {
      const res = await GET(
        send("GET", "http://localhost/api/admin/portal-content"),
      );
      expect(res.status).toBe(403);
      expect(contentFindMany).not.toHaveBeenCalled();
    });

    it("cannot publish an article onto every homeowner portal", async () => {
      const res = await POST(
        send("POST", "http://localhost/api/admin/portal-content", article),
      );
      expect(res.status).toBe(403);
      expect(contentCreate).not.toHaveBeenCalled();
    });

    it("cannot edit an article", async () => {
      const res = await PATCH(
        send("PATCH", "http://localhost/api/admin/portal-content/content_1", {
          state: "PUBLISHED",
        }),
        ctx,
      );
      expect(res.status).toBe(403);
      expect(contentUpdate).not.toHaveBeenCalled();
    });

    it("cannot delete an article", async () => {
      const res = await DELETE(
        send("DELETE", "http://localhost/api/admin/portal-content/content_1"),
        ctx,
      );
      expect(res.status).toBe(403);
      expect(contentDelete).not.toHaveBeenCalled();
    });
  });

  it("an allowlisted staff ADMIN can publish", async () => {
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "admin-1");

    const res = await POST(
      send("POST", "http://localhost/api/admin/portal-content", article),
    );

    expect(res.status).toBe(201);
    expect(contentCreate).toHaveBeenCalledTimes(1);
  });
});
