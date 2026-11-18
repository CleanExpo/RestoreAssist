import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, it, expect } from "vitest";

import { appThemeProviderProps, isUserThemedPath } from "@/lib/theme/app-theme";

const layoutSource = readFileSync(
  resolve(__dirname, "../../../app/layout.tsx"),
  "utf8",
);

describe("appThemeProviderProps", () => {
  it.each(["/dashboard", "/dashboard/settings", "/dashboard/inspections/abc"])(
    "honours the stored choice on %s",
    (path) => {
      const props = appThemeProviderProps(path);
      expect(props.forcedTheme).toBeUndefined();
      expect(props.enableSystem).toBe(true);
      expect(props.defaultTheme).toBe("dark");
      expect(props.attribute).toBe("class");
    },
  );

  it.each(["/", "/pricing", "/login", "/dashboards-fake", null])(
    "keeps public route %s dark",
    (path) => {
      expect(appThemeProviderProps(path).forcedTheme).toBe("dark");
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
