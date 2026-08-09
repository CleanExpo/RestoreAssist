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
} from "@/lib/admin-auth";

const ADMIN_SESSION = {
  user: { id: "operator_1", role: "ADMIN" },
} as Session;

beforeEach(() => {
  userFindUnique.mockReset();
  userFindUnique.mockResolvedValue({
    id: "operator_1",
    role: "ADMIN",
    organizationId: "org_1",
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
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
