/**
 * RA-8305 — the technician surfaces must render in BOTH themes.
 *
 * The Appearance setting (Light / Dark / System) was dead for two months
 * because the root layout forced dark: a stored Light choice turned the
 * header white while the page, sidebar and panels stayed hard-coded dark.
 * This guard fails when a dark-only colour class (no light pair) returns to
 * one of the surfaces a technician uses every day.
 *
 * Rule: a dark neutral background / border, or a light neutral text colour,
 * must carry a `dark:` variant. Write the light value plainly and the dark
 * value behind `dark:` (e.g. `bg-white dark:bg-slate-900`), or use a theme
 * token (`bg-background`, `bg-card`, `text-foreground`).
 *
 * Not checked (context-dependent, reviewed by screenshot instead):
 * `text-white` and white-alpha fills, which are correct on coloured buttons.
 */
import { readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");

const NEUTRAL = "(?:slate|gray|zinc|neutral|stone)";
const HUE =
  "(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)";
const DARK_ONLY = new RegExp(
  [
    `^(?:bg|from|via|to)-${NEUTRAL}-(?:700|800|900|950)(?:\\/\\d+)?$`,
    `^(?:border|divide|ring)-${NEUTRAL}-(?:700|800|900|950)(?:\\/\\d+)?$`,
    `^text-${NEUTRAL}-(?:50|100|200|300|400)(?:\\/\\d+)?$`,
    `^(?:bg|from|via|to)-${HUE}-(?:900|950)(?:\\/\\d+)?$`,
    `^text-${HUE}-(?:100|200|300|400)(?:\\/\\d+)?$`,
    "^bg-black$",
    "^bg-brand-(?:deep|ink|surface|surface-2|abyss|canvas)(?:\\/\\d+)?$",
    "^(?:bg|from|via|to)-\\[#[0-2][0-9a-fA-F]{5}\\]$",
  ].join("|"),
);

const DARK_ISLAND = /["'`]dark\s/;

/** Return `line:token` for every dark-only class with no `dark:` variant. */
export function findUnpairedDarkClasses(source: string): string[] {
  const hits: string[] = [];
  source.split("\n").forEach((line, i) => {
    // A class string that starts a dark island (a bare `dark` class) is dark
    // in both themes by design, e.g. the brand hero band.
    if (DARK_ISLAND.test(line)) return;
    for (const raw of line.split(/[\s"'`{}(),]+/)) {
      const parts = raw.split(":");
      const base = parts.pop() ?? "";
      if (parts.includes("dark")) continue;
      if (DARK_ONLY.test(base)) hits.push(`${i + 1}:${raw}`);
    }
  });
  return hits;
}

const tsxIn = (dir: string) =>
  readdirSync(join(ROOT, dir))
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => `${dir}/${f}`);

const SURFACES = [
  // App shell (sidebar, header, page background)
  "app/dashboard/DashboardShell.tsx",
  "lib/dashboard/simple-dashboard-theme.ts",
  "components/GlobalSearch.tsx",
  "components/TrialBanner.tsx",
  "components/dashboard/SimpleModeExploreBanner.tsx",
  "components/dashboard/AiProviderBanner.tsx",
  ...tsxIn("app/dashboard/components"),
  // Dashboard home
  "app/dashboard/page.tsx",
  "components/dashboard/TechLicenceBanner.tsx",
  "components/dashboard/InboundJobAlert.tsx",
  "components/SessionMetadataCard.tsx",
  // Inspections list + detail hub
  "app/dashboard/inspections/page.tsx",
  "app/dashboard/inspections/[id]/page.tsx",
  ...tsxIn("components/inspection"),
  // Settings
  "app/dashboard/settings/page.tsx",
  ...tsxIn("components/settings"),
  // Reports list
  "app/dashboard/reports/page.tsx",
  "components/dashboard/SyncedJobsPanel.tsx",
  "components/dashboard/ListPagination.tsx",
];

describe("light-mode surfaces (RA-8305)", () => {
  it("the scanner flags a planted dark-only class and passes a paired one", () => {
    expect(
      findUnpairedDarkClasses(`<div className="p-2 bg-slate-900 text-slate-300">`),
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
    expect(findUnpairedDarkClasses(`"dark relative bg-slate-900 text-slate-300"`)).toEqual([]);
    expect(findUnpairedDarkClasses(`"relative darker bg-slate-900"`)).toEqual(["1:bg-slate-900"]);
  });

  it("covers a real file list", () => {
    expect(SURFACES.length).toBeGreaterThan(50);
  });

  it.each(SURFACES)("%s has no dark-only colour class", (file) => {
    const source = readFileSync(join(ROOT, file), "utf8");
    expect(findUnpairedDarkClasses(source)).toEqual([]);
  });
});
