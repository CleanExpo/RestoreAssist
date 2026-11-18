import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, it, expect } from "vitest";

import { appThemeProviderProps, isUserThemedPath } from "@/lib/theme/app-theme";

const layoutSource = readFileSync(
  resolve(__dirname, "../../../app/layout.tsx"),
  "utf8",
);

describe("appThemeProviderProps", () => {
  it.each([
    "/dashboard",
    "/dashboard/settings",
    "/dashboard/inspections/abc",
    "/",
    "/pricing",
    "/login",
    null,
  ])("honours the stored choice and defaults to light on %s", (path) => {
    const props = appThemeProviderProps(path) as unknown as Record<
      string,
      unknown
    >;
    expect(props.forcedTheme).toBeUndefined();
    expect(props.enableSystem).toBe(true);
    expect(props.defaultTheme).toBe("light");
    expect(props.attribute).toBe("class");
  });

  it.each(["/", "/pricing", "/login", "/dashboards-fake", null])(
    "does not treat public route %s as the signed-in workspace",
    (path) => {
      expect(isUserThemedPath(path)).toBe(false);
    },
  );
});

describe("root layout", () => {
  it("does not hard-code the dark class on <html>", () => {
    expect(layoutSource).not.toMatch(/className=\{`dark\s/);
    expect(layoutSource).not.toMatch(/className="dark\s/);
  });

  it("has no inline script that always adds the dark class", () => {
    expect(layoutSource).not.toMatch(/classList\.add\(\s*["']dark["']\s*\)/);
  });

  it("does not pass a literal forcedTheme to the provider", () => {
    expect(layoutSource).not.toMatch(/forcedTheme=/);
    expect(layoutSource).toMatch(/<AppThemeProvider>/);
  });
});
