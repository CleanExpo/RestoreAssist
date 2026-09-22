/**
 * RA-7647 — InsurerProfile has no organizationId: one row is read by every
 * business. Changing it is RestoreAssist staff work, and every self-signup is
 * role ADMIN, so `verifyAdminFromDb` alone let any trial business rewrite the
 * insurer rules the whole platform relies on. Real admin-auth helpers run.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const profileCreate = vi.fn();
const profileUpdate = vi.fn();
const profileDelete = vi.fn();
const profileFindUnique = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    insurerProfile: {
      create: (...args: unknown[]) => profileCreate(...args),
      update: (...args: unknown[]) => profileUpdate(...args),
      delete: (...args: unknown[]) => profileDelete(...args),
      findUnique: (...args: unknown[]) => profileFindUnique(...args),
    },
  },
}));

import { POST } from "../route";
import { PATCH, DELETE } from "../[id]/route";

const ctx = { params: Promise.resolve({ id: "profile_1" }) };

function body(method: string, url: string, payload: unknown) {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
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
  profileCreate.mockResolvedValue({ id: "profile_new" });
  profileUpdate.mockResolvedValue({ id: "profile_1", isActive: false });
  profileDelete.mockResolvedValue({ id: "profile_1" });
  profileFindUnique.mockResolvedValue({ id: "profile_1", isSystemProfile: false });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("insurer profiles are staff-only (RA-7647)", () => {
  describe("a tenant ADMIN not on the staff allowlist", () => {
    beforeEach(() => {
      vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "someone-else");
    });

    it("cannot create a profile", async () => {
      const res = await POST(
        body("POST", "http://localhost/api/insurer-profiles", {
          slug: "acme",
          name: "Acme Insurance",
        }),
      );
      expect(res.status).toBe(403);
      expect(profileCreate).not.toHaveBeenCalled();
    });

    it("cannot change a profile every business shares", async () => {
      const res = await PATCH(
        body("PATCH", "http://localhost/api/insurer-profiles/profile_1", {
          isActive: false,
        }),
        ctx,
      );
      expect(res.status).toBe(403);
      expect(profileUpdate).not.toHaveBeenCalled();
    });

    it("cannot delete a profile", async () => {
      const res = await DELETE(
        new NextRequest("http://localhost/api/insurer-profiles/profile_1", {
          method: "DELETE",
        }),
        ctx,
      );
      expect(res.status).toBe(403);
      expect(profileDelete).not.toHaveBeenCalled();
    });
  });

  it("an allowlisted staff ADMIN can change a profile", async () => {
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "admin-1");

    const res = await PATCH(
      body("PATCH", "http://localhost/api/insurer-profiles/profile_1", {
        isActive: false,
      }),
      ctx,
    );

    expect(res.status).toBe(200);
    expect(profileUpdate).toHaveBeenCalledTimes(1);
  });
});
