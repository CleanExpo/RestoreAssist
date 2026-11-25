/**
 * RA-8638: verifyPlatformSupportOperator is the one HTTP staff check behind the
 * support tickets, voice and health detail. It must never admit a business-owner
 * ADMIN through the development fallback (NODE_ENV=development with
 * PLATFORM_SUPPORT_DEV_OPEN=true and an empty allowlist).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

import { verifyPlatformSupportOperator } from "@/lib/admin-auth";

const owner = { user: { id: "owner-1", role: "ADMIN", organizationId: "org-1" } };

describe("verifyPlatformSupportOperator is strict in every environment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses an unlisted ADMIN even when the development fallback is open", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PLATFORM_SUPPORT_DEV_OPEN", "true");
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "");
    const result = verifyPlatformSupportOperator(owner);
    expect(result.user).toBeUndefined();
    expect(result.response?.status).toBe(403);
  });

  it("admits a listed ADMIN", () => {
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "owner-1");
    const result = verifyPlatformSupportOperator(owner);
    expect(result.response).toBeUndefined();
    expect(result.user?.id).toBe("owner-1");
  });
});
