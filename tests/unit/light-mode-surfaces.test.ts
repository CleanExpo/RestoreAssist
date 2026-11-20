/**
 * RA-8305 / RA-8383: the dashboard must render in BOTH themes.
 *
 * Light is the default (19/11/2026), so every route under /dashboard is seen
 * in light by most users. This guard fails when a dark-only colour class (no
 * light pair) appears in any dashboard file or in a shared surface the
 * dashboard renders. The rule itself lives in lib/theme/dark-only-classes.ts.
 *
 * Every .tsx under app/dashboard is found by reading the folder (RA-8383), not
 * from a hand-written list. LIGHT_PENDING lists files that are not light-ready
 * yet; it may only shrink: a listed file that becomes clean fails until its
 * line is deleted, and an unlisted file with a hit fails.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";
import { describe, expect, it } from "vitest";

import { findUnpairedDarkClasses } from "@/lib/theme/dark-only-classes";

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

/**
 * Dashboard files not light-ready yet. This list may only shrink, and since
 * RA-8383 slice 1b it is empty: every dashboard file must be light-ready.
 */
const LIGHT_PENDING: string[] = [];

const DASHBOARD_FILES = tsxUnder("app/dashboard");
const PENDING = new Set(LIGHT_PENDING);
const hitsIn = (file: string) =>
  findUnpairedDarkClasses(readFileSync(join(ROOT, file), "utf8"));

// Shared surfaces outside app/dashboard that the dashboard renders.
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
    // The harbour scale (RA-8464, formerly cyan) is a hue like any other.
    expect(
      findUnpairedDarkClasses(
        `"bg-brand-harbour-950/30 text-brand-harbour-300"`,
      ),
    ).toEqual(["1:bg-brand-harbour-950/30", "1:text-brand-harbour-300"]);
    expect(
      findUnpairedDarkClasses(
        `"text-brand-harbour-700 dark:text-brand-harbour-300"`,
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
    // Line numbers follow the source, including inside a multi-line template.
    expect(
      findUnpairedDarkClasses("const a = 1;\nconst b = `p-2\n  bg-slate-800`;"),
    ).toEqual(["3:bg-slate-800"]);
  });

  it("an exemption reaches only its own class string (RA-8307, RA-8368)", () => {
    // RA-8307: a comment that looks like a dark island hides nothing.
    expect(
      findUnpairedDarkClasses(
        `<div className="bg-slate-950" /> // "dark fake"`,
      ),
    ).toEqual(["1:bg-slate-950"]);
    expect(
      findUnpairedDarkClasses(
        `<div className="bg-slate-950" /> {/* "dark fake" */}`,
      ),
    ).toEqual(["1:bg-slate-950"]);
    // RA-8368 (3): a dark island on one element does not cover the next one.
    expect(
      findUnpairedDarkClasses(
        `<div className="dark bg-slate-900" /><div className="bg-slate-900" />`,
      ),
    ).toEqual(["1:bg-slate-900"]);
    // RA-8368 (3): a hover fill on one element does not cover the next one.
    expect(
      findUnpairedDarkClasses(
        `<button className="hover:bg-blue-600" /><a className="hover:text-white" />`,
      ),
    ).toEqual(["1:hover:text-white"]);
    // RA-8368 (1): a pale hover fill cannot carry white text.
    expect(
      findUnpairedDarkClasses(`"hover:bg-blue-50 hover:text-white"`),
    ).toEqual(["1:hover:text-white"]);
    // RA-8368 (2): a commented-out dark island does not exempt the line.
    expect(
      findUnpairedDarkClasses(
        `const c = "text-slate-300"; // const d = "dark x"`,
      ),
    ).toEqual(["1:text-slate-300"]);
    // An apostrophe in JSX text does not swallow the following lines.
    expect(
      findUnpairedDarkClasses(
        `<p>Don't stop</p>\n<div className="text-slate-400" />`,
      ),
    ).toEqual(["2:text-slate-400"]);
  });

  it("finds every dashboard .tsx from the file system", () => {
    expect(DASHBOARD_FILES.length).toBeGreaterThan(200);
    expect(
      DASHBOARD_FILES.filter((f) => f.endsWith("/page.tsx")).length,
    ).toBeGreaterThan(140);
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
    expect(LIGHT_PENDING.filter((f) => !known.has(f))).toEqual([]);
    expect(PENDING.size).toBe(LIGHT_PENDING.length);
  });

  it.each(DASHBOARD_FILES)("%s matches its light-ready status", (file) => {
    const hits = hitsIn(file);
    if (PENDING.has(file)) {
      expect(
        hits.length,
        `${file} is clean; remove it from LIGHT_PENDING`,
      ).toBeGreaterThan(0);
    } else {
      expect(hits).toEqual([]);
    }
  });

  it.each(SHARED_SURFACES)("%s has no dark-only colour class", (file) => {
    expect(hitsIn(file)).toEqual([]);
  });
});
