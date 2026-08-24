import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";

const userFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
  },
}));

import {
  verifyAdminFromDb,
  verifyStorePublishingOperator,
  requireAdminPage,
} from "@/lib/admin-auth";

const ADMIN_SESSION = {
  user: { id: "operator_1", role: "ADMIN" },
} as Session;

const redirectMock = vi.hoisted(() => vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

import { getServerSession } from "next-auth";

beforeEach(() => {
  userFindUnique.mockReset();
  redirectMock.mockClear();
  userFindUnique.mockResolvedValue({
    id: "operator_1",
    role: "ADMIN",
    organizationId: "org_1",
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requireAdminPage", () => {
  it("redirects to login when there is no session", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    await expect(requireAdminPage()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("redirects to dashboard when JWT says ADMIN but DB does not", async () => {
    vi.mocked(getServerSession).mockResolvedValue(ADMIN_SESSION);
    userFindUnique.mockResolvedValue({
      id: "operator_1",
      role: "USER",
      organizationId: "org_1",
    });
    await expect(requireAdminPage()).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard",
    );
  });

  it("returns the DB-verified admin user when role is current", async () => {
    vi.mocked(getServerSession).mockResolvedValue(ADMIN_SESSION);
    await expect(requireAdminPage()).resolves.toEqual({
      id: "operator_1",
      role: "ADMIN",
      organizationId: "org_1",
    });
  });
});

describe("verifyStorePublishingOperator", () => {
  it("fails closed when no operator allowlist is configured", async () => {
    vi.stubEnv("STORE_PUBLISHING_OPERATOR_USER_IDS", "");

    const adminAuth = await verifyAdminFromDb(ADMIN_SESSION);
    const result = verifyStorePublishingOperator(adminAuth);

    expect(result.response?.status).toBe(403);
  });

  it("rejects a tenant admin who is not explicitly allowlisted", async () => {
    vi.stubEnv("STORE_PUBLISHING_OPERATOR_USER_IDS", "different_user");

    const adminAuth = await verifyAdminFromDb(ADMIN_SESSION);
    const result = verifyStorePublishingOperator(adminAuth);

    expect(result.response?.status).toBe(403);
  });

  it("accepts an explicitly allowlisted admin after DB role revalidation", async () => {
    vi.stubEnv(
      "STORE_PUBLISHING_OPERATOR_USER_IDS",
      " other_user, operator_1 ",
    );

    const adminAuth = await verifyAdminFromDb(ADMIN_SESSION);
    const result = verifyStorePublishingOperator(adminAuth);

    expect(result.response).toBeUndefined();
    expect(result.user).toEqual({
      id: "operator_1",
      role: "ADMIN",
      organizationId: "org_1",
    });
    expect(userFindUnique).toHaveBeenCalledTimes(1);
  });
});
