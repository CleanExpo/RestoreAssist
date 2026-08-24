import { describe, it, expect } from "vitest";
import {
  buildAdvancedNavGroups,
  simpleNavItems,
  ADMIN_NAV_HREFS,
  type NavItem,
} from "../nav-config";
import {
  LayoutDashboard,
  Plus,
  HardHat,
  FolderKanban,
  Library,
  Shield,
  Activity,
} from "lucide-react";

/**
 * Guards the Simple-mode credit-check regression: both Simple ("Make a Report")
 * and Advanced ("New Report") must share the same create-report href so the
 * shell can gate on href rather than a brittle label string.
 */
describe("dashboard nav — create-report gate href", () => {
  it("Simple mode Make a Report points at /dashboard/reports/new", () => {
    const makeReport = simpleNavItems.find((i) => i.highlight);
    expect(makeReport?.href).toBe("/dashboard/reports/new");
    expect(makeReport?.label).toBe("Make a Report");
  });

  it("lists the six Admin destinations for Simple-mode admin append", () => {
    expect(ADMIN_NAV_HREFS.map((i) => i.href)).toEqual([
      "/dashboard/admin",
      "/dashboard/admin/pilot",
      "/dashboard/admin/content-gate",
      "/dashboard/governance",
      "/dashboard/admin/restoration-insights",
      "/dashboard/margot/home",
    ]);
  });

  it("groups WHS, Claims, and Cost Libraries when present in the flat list", () => {
    const flat: NavItem[] = [
      { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
      {
        icon: Plus,
        label: "New Report",
        href: "/dashboard/reports/new",
        highlight: true,
      },
      { icon: HardHat, label: "WHS", href: "/dashboard/whs" },
      { icon: FolderKanban, label: "Claims", href: "/dashboard/claims" },
      {
        icon: Library,
        label: "Cost Libraries",
        href: "/dashboard/cost-libraries",
      },
      {
        icon: Shield,
        label: "Admin",
        href: "/dashboard/admin",
        adminOnly: true,
      },
      {
        icon: Activity,
        label: "Governance",
        href: "/dashboard/governance",
        adminOnly: true,
      },
    ];

    const groups = buildAdvancedNavGroups(flat);
    const byLabel = Object.fromEntries(groups.map((g) => [g.label, g.items]));

    expect(byLabel["Compliance & WHS"]?.map((i) => i.href)).toEqual(
      expect.arrayContaining(["/dashboard/whs", "/dashboard/claims"]),
    );
    expect(byLabel["Documents & Billing"]?.map((i) => i.href)).toContain(
      "/dashboard/cost-libraries",
    );
    // adminOnly items land in Admin regardless of HREF_TO_GROUP
    expect(byLabel.Admin?.map((i) => i.href)).toEqual(
      expect.arrayContaining([
        "/dashboard/admin",
        "/dashboard/governance",
      ]),
    );
  });
});
