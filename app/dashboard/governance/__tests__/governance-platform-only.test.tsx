/**
 * RA-8043c (21/10/2026): the override governance page shows platform-wide
 * override figures. Its layout admitted any ADMIN — every firm owner — so it
 * now also requires the platform support allowlist.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

class NotFound extends Error {}

const viewer = vi.hoisted(() => ({ id: "firm_owner_a" }));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("not found");
  },
  redirect: vi.fn(),
}));
vi.mock("@/lib/admin-auth", () => ({
  requireAdminPage: async () => ({
    id: viewer.id,
    role: "ADMIN",
    organizationId: "org_a",
  }),
}));
const findMany = vi.hoisted(() => vi.fn(async () => []));
vi.mock("@/lib/prisma", () => ({
  prisma: { overrideGovernanceReport: { findMany } },
}));

import GovernanceLayout from "../layout";
import GovernancePage from "../page";

async function open(): Promise<"not-found" | "rendered"> {
  try {
    await GovernanceLayout({ children: "page" });
    return "rendered";
  } catch (e) {
    if (e instanceof NotFound) return "not-found";
    throw e;
  }
}

// Next renders the page alongside its layout, so the layout's notFound()
// does not stop the page's reads; the page must gate itself.
async function renderPage(): Promise<"not-found" | "rendered"> {
  try {
    await GovernancePage({ searchParams: Promise.resolve({}) });
    return "rendered";
  } catch (e) {
    if (e instanceof NotFound) return "not-found";
    throw e;
  }
}

beforeEach(() => {
  viewer.id = "firm_owner_a";
  delete process.env.PLATFORM_SUPPORT_USER_IDS;
  findMany.mockClear();
});

describe("override governance page access (RA-8043c)", () => {
  it("is not found for a firm owner (tenant ADMIN) [ra-8043c]", async () => {
    expect(await open()).toBe("not-found");
  });

  it("opens for an allowlisted platform support operator", async () => {
    process.env.PLATFORM_SUPPORT_USER_IDS = "staff_1";
    viewer.id = "staff_1";
    expect(await open()).toBe("rendered");
  });

  it("never reads governance reports for a firm owner, even without the layout [ra-8043c]", async () => {
    expect(await renderPage()).toBe("not-found");
    expect(findMany).not.toHaveBeenCalled();
  });

  it("reads governance reports for an allowlisted platform support operator", async () => {
    process.env.PLATFORM_SUPPORT_USER_IDS = "staff_1";
    viewer.id = "staff_1";
    expect(await renderPage()).toBe("rendered");
    expect(findMany).toHaveBeenCalled();
  });
});
