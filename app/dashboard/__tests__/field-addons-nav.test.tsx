import { describe, it, expect } from "vitest";
import {
  buildAdvancedNavGroups,
  buildSimpleNavItems,
  fieldAddonsTabVisible,
  FIELD_ADDONS_NAV_ITEM,
} from "../nav-config";

/**
 * RA-8271 — a new owner starts in Simple mode, and before this change the
 * add-on packs were only in the Advanced sidebar, so a new owner never saw
 * them. These guard the Field Add-Ons tab in both modes and who sees it.
 */
describe("Field Add-Ons side-panel tab", () => {
  it("RA-8665: is called Add-Ons and opens the add-ons page", () => {
    expect(FIELD_ADDONS_NAV_ITEM.label).toBe("Add-Ons");
    expect(FIELD_ADDONS_NAV_ITEM.href).toBe("/dashboard/addons");
  });

  it("RA-8665: sits straight after Overview, at the top of the Simple sidebar", () => {
    const hrefs = buildSimpleNavItems({ showFieldAddons: true }).map(
      (i) => i.href,
    );
    expect(hrefs.slice(0, 2)).toEqual(["/dashboard", "/dashboard/addons"]);
  });

  it("RA-8665: for an owner who also gets the manager inbox, it is once, in the top two", () => {
    const items = buildSimpleNavItems({ isManager: true, showFieldAddons: true });
    expect(items.filter((i) => i.href === "/dashboard/addons")).toHaveLength(1);
    expect(items.findIndex((i) => i.href === "/dashboard/addons")).toBeLessThan(2);
  });

  it("is absent from the Simple sidebar when the shell says not to show it", () => {
    expect(
      buildSimpleNavItems({ isManager: true }).some(
        (i) => i.href === "/dashboard/addons",
      ),
    ).toBe(false);
    expect(
      buildSimpleNavItems().some((i) => i.href === "/dashboard/addons"),
    ).toBe(false);
  });

  it("RA-8665: leads the Advanced sidebar as its own first group, not under Setup", () => {
    const flat = [
      { icon: FIELD_ADDONS_NAV_ITEM.icon, label: "Dashboard", href: "/dashboard" },
      { icon: FIELD_ADDONS_NAV_ITEM.icon, label: "Team", href: "/dashboard/team" },
      FIELD_ADDONS_NAV_ITEM,
      { icon: FIELD_ADDONS_NAV_ITEM.icon, label: "Settings", href: "/dashboard/settings" },
    ];
    const groups = buildAdvancedNavGroups(flat);
    expect(groups[0].label).toBe("Add-Ons");
    expect(groups[0].items.map((i) => i.href)).toEqual(["/dashboard/addons"]);
    expect(groups.find((g) => g.label === "Setup")?.items.map((i) => i.href)).toEqual([
      "/dashboard/team",
      "/dashboard/settings",
    ]);
  });

  it("is visible to the business owner only, and never in the iOS app", () => {
    expect(fieldAddonsTabVisible({ role: "ADMIN", hideBillingNav: false })).toBe(true);
    expect(fieldAddonsTabVisible({ role: "MANAGER", hideBillingNav: false })).toBe(false);
    expect(fieldAddonsTabVisible({ role: "USER", hideBillingNav: false })).toBe(false);
    expect(fieldAddonsTabVisible({ role: "ADMIN", hideBillingNav: true })).toBe(false);
    // Session not loaded yet: no tab rather than a tab that may be refused.
    expect(fieldAddonsTabVisible({ role: undefined, hideBillingNav: false })).toBe(false);
  });
});
