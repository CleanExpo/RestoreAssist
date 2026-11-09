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
  it("is called Field Add-Ons and opens the add-ons page", () => {
    expect(FIELD_ADDONS_NAV_ITEM.label).toBe("Field Add-Ons");
    expect(FIELD_ADDONS_NAV_ITEM.href).toBe("/dashboard/addons");
  });

  it("shows in the Simple sidebar for an owner, above Account & Billing", () => {
    const hrefs = buildSimpleNavItems({ showFieldAddons: true }).map(
      (i) => i.href,
    );
    const at = hrefs.indexOf("/dashboard/addons");
    expect(at).toBeGreaterThan(-1);
    expect(hrefs[at + 1]).toBe("/dashboard/subscription");
  });

  it("shows in the Simple sidebar for an owner who also gets the manager inbox", () => {
    const items = buildSimpleNavItems({ isManager: true, showFieldAddons: true });
    expect(items.filter((i) => i.href === "/dashboard/addons")).toHaveLength(1);
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

  it("is grouped under Setup in the Advanced sidebar, not left in More", () => {
    const groups = buildAdvancedNavGroups([FIELD_ADDONS_NAV_ITEM]);
    expect(groups.map((g) => g.label)).toEqual(["Setup"]);
    expect(groups[0].items[0].label).toBe("Field Add-Ons");
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
