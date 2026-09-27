import { describe, expect, it, beforeEach, vi } from "vitest";

const getServerSession = vi.fn();
const redirect = vi.fn((to: string) => {
  throw new Error(`REDIRECT:${to}`);
});

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => redirect(to),
}));

import {
  DASHBOARD_PAGE_ACCESS,
  canOpenDashboardPage,
  requireDashboardPageAccess,
} from "../dashboard-page-access";

const OWNER_PAGES = [
  "/dashboard/subscription",
  "/dashboard/addons",
  "/dashboard/team",
  "/dashboard/pricing-config",
  "/dashboard/integrations",
] as const;

beforeEach(() => vi.clearAllMocks());

describe("dashboard page access by role (RA-7721, deny by default)", () => {
  it("covers exactly the owner pages", () => {
    expect(Object.keys(DASHBOARD_PAGE_ACCESS).sort()).toEqual(
      [...OWNER_PAGES].sort(),
    );
  });

  it("a technician can open none of them", () => {
    for (const page of OWNER_PAGES) {
      expect(canOpenDashboardPage("USER", page)).toBe(false);
    }
  });

  it("a manager can open Team, Pricing Configuration and Integrations, not Subscription or Add-ons", () => {
    expect(canOpenDashboardPage("MANAGER", "/dashboard/team")).toBe(true);
    expect(canOpenDashboardPage("MANAGER", "/dashboard/pricing-config")).toBe(true);
    expect(canOpenDashboardPage("MANAGER", "/dashboard/integrations")).toBe(true);
    expect(canOpenDashboardPage("MANAGER", "/dashboard/subscription")).toBe(false);
    expect(canOpenDashboardPage("MANAGER", "/dashboard/addons")).toBe(false);
  });

  it("the owner can open all of them", () => {
    for (const page of OWNER_PAGES) {
      expect(canOpenDashboardPage("ADMIN", page)).toBe(true);
    }
  });

  it("an unknown or missing role is denied", () => {
    expect(canOpenDashboardPage(undefined, "/dashboard/team")).toBe(false);
    expect(canOpenDashboardPage("SUPERUSER", "/dashboard/team")).toBe(false);
  });
});

describe("requireDashboardPageAccess (server guard)", () => {
  it("sends a signed-out visitor to login", async () => {
    getServerSession.mockResolvedValueOnce(null);
    await expect(
      requireDashboardPageAccess("/dashboard/team"),
    ).rejects.toThrow("REDIRECT:/login");
  });

  it("sends a technician to Field Mode", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "t1", role: "USER" } });
    await expect(
      requireDashboardPageAccess("/dashboard/subscription"),
    ).rejects.toThrow("REDIRECT:/dashboard/field");
  });

  it("sends a manager away from Subscription to the dashboard", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "m1", role: "MANAGER" } });
    await expect(
      requireDashboardPageAccess("/dashboard/subscription"),
    ).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("lets the owner through", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "o1", role: "ADMIN" } });
    await expect(
      requireDashboardPageAccess("/dashboard/subscription"),
    ).resolves.toBeUndefined();
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("each owner page is wrapped by the guard", () => {
  it.each(OWNER_PAGES)("%s has a layout that calls the guard for itself", async (page) => {
    const mod = await import(`../../../app${page}/layout`);
    getServerSession.mockResolvedValueOnce({ user: { id: "t1", role: "USER" } });
    await expect(mod.default({ children: null })).rejects.toThrow(
      "REDIRECT:/dashboard/field",
    );
    getServerSession.mockResolvedValueOnce({ user: { id: "o1", role: "ADMIN" } });
    await expect(mod.default({ children: "ok" })).resolves.toBe("ok");
  });
});
