import { describe, expect, it } from "vitest";
import { isNavItemActive } from "../nav-active";

describe("isNavItemActive", () => {
  it("highlights dashboard home only on the overview route", () => {
    expect(isNavItemActive("/dashboard", "/dashboard")).toBe(true);
    expect(isNavItemActive("/dashboard/inspections", "/dashboard")).toBe(
      false,
    );
  });

  it("highlights inspections on detail routes but not new-job create", () => {
    expect(
      isNavItemActive("/dashboard/inspections/abc", "/dashboard/inspections"),
    ).toBe(true);
    expect(
      isNavItemActive(
        "/dashboard/inspections/new",
        "/dashboard/inspections",
      ),
    ).toBe(false);
    expect(
      isNavItemActive(
        "/dashboard/inspections/new",
        "/dashboard/inspections/new",
      ),
    ).toBe(true);
  });

  it("does not highlight reports list when creating a report", () => {
    expect(
      isNavItemActive("/dashboard/reports/new", "/dashboard/reports"),
    ).toBe(false);
    expect(
      isNavItemActive("/dashboard/reports/r1", "/dashboard/reports"),
    ).toBe(true);
  });
});
