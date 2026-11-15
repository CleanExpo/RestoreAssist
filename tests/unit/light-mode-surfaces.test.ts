/**
 * RA-8305 / RA-8383 — the dashboard must render in BOTH themes.
 *
 * The Appearance setting (Light / Dark / System) was dead for two months
 * because the root layout forced dark: a stored Light choice turned the
 * header white while the page, sidebar and panels stayed hard-coded dark.
 * This guard fails when a dark-only colour class (no light pair) appears on
 * a surface a user in Light can reach. The rule itself lives in
 * lib/theme/dark-only-classes.ts.
 *
 * Every .tsx under app/dashboard is found by reading the folder (RA-8383).
 * Files that are not light-ready yet are on LIGHT_PENDING_FILES, and their
 * routes stay forced dark. That list may only shrink.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";
import { describe, expect, it } from "vitest";

import { appThemeProviderProps } from "@/lib/theme/app-theme";
import { findUnpairedDarkClasses } from "@/lib/theme/dark-only-classes";
import { LIGHT_PENDING_FILES } from "@/lib/theme/light-pending";

const ROOT = resolve(__dirname, "../..");

const tsxIn = (dir: string) =>
  readdirSync(join(ROOT, dir))
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => `${dir}/${f}`);

/** Every .tsx under a folder, read from disk. Tests are not UI. */
function tsxUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) {
      if (name !== "__tests__") out.push(...tsxUnder(rel));
    } else if (name.endsWith(".tsx") && !/\.(test|spec)\.tsx$/.test(name)) {
      out.push(rel);
    }
  }
  return out.sort();
}

const DASHBOARD_FILES = tsxUnder("app/dashboard");
const DASHBOARD_PAGES = DASHBOARD_FILES.filter((f) => f.endsWith("/page.tsx"));
const PENDING = new Set(LIGHT_PENDING_FILES);
const hitsIn = (file: string) =>
  findUnpairedDarkClasses(readFileSync(join(ROOT, file), "utf8"));

// Shared surfaces outside app/dashboard that the dashboard renders. Files
// inside app/dashboard are covered by DASHBOARD_FILES, not listed here.
const SHARED_SURFACES = [
  "lib/dashboard/simple-dashboard-theme.ts",
  "components/GlobalSearch.tsx",
  "components/TrialBanner.tsx",
  "components/dashboard/SimpleModeExploreBanner.tsx",
  "components/dashboard/AiProviderBanner.tsx",
  "components/dashboard/TechLicenceBanner.tsx",
  "components/dashboard/InboundJobAlert.tsx",
  "components/SessionMetadataCard.tsx",
  ...tsxIn("components/inspection"),
  ...tsxIn("components/settings"),
  "components/dashboard/SyncedJobsPanel.tsx",
  "components/dashboard/ListPagination.tsx",
];

/**
 * A URL a page file serves, with each dynamic segment filled in. Route
 * groups add no segment. Catch-all segments are not used under
 * app/dashboard today; a test below fails if one appears.
 */
function sampleRouteFor(pageFile: string): string {
  return (
    "/" +
    pageFile
      .replace(/^app\//, "")
      .replace(/\/page\.tsx$/, "")
      .split("/")
      .filter((seg) => !/^\(.*\)$/.test(seg))
      .map((seg) => (/^\[.+\]$/.test(seg) ? "sample-id" : seg))
      .join("/")
  );
}

describe("light-mode surfaces (RA-8305, RA-8383)", () => {
  it("the scanner flags a planted dark-only class and passes a paired one", () => {
    expect(
      findUnpairedDarkClasses(
        `<div className="p-2 bg-slate-900 text-slate-300">`,
      ),
    ).toEqual(["1:bg-slate-900", "1:text-slate-300"]);
    expect(
      findUnpairedDarkClasses(`cn("hover:bg-slate-800", 'border-gray-700/50')`),
    ).toEqual(["1:hover:bg-slate-800", "1:border-gray-700/50"]);
    expect(
      findUnpairedDarkClasses(
        `"bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 bg-black/50"`,
      ),
    ).toEqual([]);
    // A deliberate dark island is exempt; the same classes without it are not.
    expect(
      findUnpairedDarkClasses(`"dark relative bg-slate-900 text-slate-300"`),
    ).toEqual([]);
    expect(findUnpairedDarkClasses(`"relative darker bg-slate-900"`)).toEqual([
      "1:bg-slate-900",
    ]);
    // Neutral text that turns white on hover disappears in Light mode.
    expect(
      findUnpairedDarkClasses(
        `"flex gap-2 hover:text-white transition-colors"`,
      ),
    ).toEqual(["1:hover:text-white"]);
    expect(
      findUnpairedDarkClasses(`"hover:text-slate-900 dark:hover:text-white"`),
    ).toEqual([]);
    expect(
      findUnpairedDarkClasses(
        `"border-blue-600 hover:bg-blue-600 hover:text-white"`,
      ),
    ).toEqual([]);
  });

  it("finds every dashboard .tsx from the file system", () => {
    // 234 files and 148 pages on f126ab810; a sharp drop means the walk broke.
    expect(DASHBOARD_FILES.length).toBeGreaterThan(200);
    expect(DASHBOARD_PAGES.length).toBeGreaterThan(140);
    expect(DASHBOARD_FILES).toContain("app/dashboard/DashboardShell.tsx");
    expect(DASHBOARD_FILES).toContain(
      "app/dashboard/inspections/[id]/page.tsx",
    );
    expect(
      DASHBOARD_FILES.filter((f) => /__tests__|\.(test|spec)\./.test(f)),
    ).toEqual([]);
  });

  it("every not-ready entry is a real dashboard file, listed once", () => {
    const known = new Set(DASHBOARD_FILES);
    expect(LIGHT_PENDING_FILES.filter((f) => !known.has(f))).toEqual([]);
    expect(PENDING.size).toBe(LIGHT_PENDING_FILES.length);
  });

  it.each(DASHBOARD_FILES)("%s matches its light-ready status", (file) => {
    const hits = hitsIn(file);
    if (PENDING.has(file)) {
      // Clean now: delete this file's line from lib/theme/light-pending.ts.
      expect(
        hits.length,
        `${file} is clean; remove it from LIGHT_PENDING_FILES`,
      ).toBeGreaterThan(0);
    } else {
      expect(hits).toEqual([]);
    }
  });

  it.each(SHARED_SURFACES)("%s has no dark-only colour class", (file) => {
    expect(hitsIn(file)).toEqual([]);
  });

  it("no dashboard route uses a catch-all segment the route test cannot fill", () => {
    expect(DASHBOARD_PAGES.filter((f) => f.includes("[..."))).toEqual([]);
  });

  it("every dashboard route is clean or stays forced dark", () => {
    const unsafe = DASHBOARD_PAGES.filter(
      (page) =>
        hitsIn(page).length > 0 &&
        appThemeProviderProps(sampleRouteFor(page)).forcedTheme !== "dark",
    );
    expect(unsafe).toEqual([]);
  });

  it("clean routes follow the Appearance setting; pending routes stay dark", () => {
    expect(appThemeProviderProps("/dashboard").forcedTheme).toBeUndefined();
    expect(
      appThemeProviderProps("/dashboard/settings").forcedTheme,
    ).toBeUndefined();
    expect(
      appThemeProviderProps("/dashboard/inspections/abc").forcedTheme,
    ).toBeUndefined();
    expect(appThemeProviderProps("/dashboard/subscription").forcedTheme).toBe(
      "dark",
    );
    expect(appThemeProviderProps("/dashboard/subscription/").forcedTheme).toBe(
      "dark",
    );
    expect(appThemeProviderProps("/dashboard/whs").forcedTheme).toBe("dark");
    expect(appThemeProviderProps("/dashboard/clients/abc").forcedTheme).toBe(
      "dark",
    );
  });
});
