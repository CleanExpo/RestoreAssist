/**
 * RA-7721 review r1 (P2): the Founding Trial page is support-staff work.
 * The inherited /dashboard/admin layout admits every tenant ADMIN (every
 * self-signup is one), so this segment gates on the platform-support
 * allowlist itself. requireAdminPage is doubled to return a real DB-verified
 * ADMIN for both callers; only the allowlist can separate them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminPage = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/lib/admin-auth", () => ({
  requireAdminPage: (...a: unknown[]) => requireAdminPage(...a),
}));
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));

import FoundingTrialLayout from "../layout";

const OPERATOR = "operator_ra7721";
const TENANT_ADMIN = "tenant_admin_ra7721";

function signIn(id: string) {
  requireAdminPage.mockResolvedValue({ id, role: "ADMIN", organizationId: "org_x" });
}

beforeEach(() => {
  requireAdminPage.mockReset();
  notFound.mockClear();
  vi.unstubAllEnvs();
});
afterEach(() => vi.unstubAllEnvs());

describe("/dashboard/admin/founding-trial layout", () => {
  it("a tenant ADMIN cannot open the page", async () => {
    signIn(TENANT_ADMIN);
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", OPERATOR);
    await expect(FoundingTrialLayout({ children: "FORM" })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the allowlist is unset", async () => {
    signIn(OPERATOR);
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "");
    await expect(FoundingTrialLayout({ children: "FORM" })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("positive control: an allowlisted operator sees the page", async () => {
    signIn(OPERATOR);
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", `someone_else, ${OPERATOR}`);
    await expect(FoundingTrialLayout({ children: "FORM" })).resolves.toBe("FORM");
    expect(notFound).not.toHaveBeenCalled();
  });
});
