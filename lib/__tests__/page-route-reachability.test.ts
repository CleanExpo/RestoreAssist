/**
 * RA-8081 — every app page must be reachable by a link, not only by a typed URL.
 *
 * Walks app/** /page.tsx, turns each folder path into its route, and looks for
 * an exact reference to that route in the app's own source (app, components,
 * lib, hooks, proxy.ts, next.config.mjs), tests excluded and the page's own
 * folder excluded. A dynamic segment such as [id] matches a template
 * placeholder `${...}`. "Exact" means the route must end there: a link to
 * `/dashboard/inspections/${id}` does not count as a link to
 * `/dashboard/inspections/[id]/print` (the RA-7991 prefix-match mistake).
 *
 * Pages that are deliberately URL-only, or whose link is owned by another
 * ticket, are listed in ALLOWLIST with a reason. An allowlisted page that
 * becomes linked fails too, so the list can only shrink.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(__dirname, "..", "..");
const appDir = join(repoRoot, "app");

const SOURCE_ROOTS = ["app", "components", "lib", "hooks"];
const SOURCE_FILES = ["proxy.ts", "next.config.mjs"];
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs)$/;
const TEST_FILE = /\.(test|spec)\.[jt]sx?$/;

// Unlinked on main when RA-8081 landed (2026-10-26). Remove an entry when its
// link ships; the stale-entry test below enforces that.
const PRE_EXISTING = "unlinked before RA-8081; owned by RA-7991 or not yet triaged";
const ALLOWLIST: Record<string, string> = {
  "/dashboard/admin/blocked-customers": "RA-7992",
  "/dashboard/admin/cron-runs": "RA-7992",
  "/dashboard/admin/video-analytics": "RA-7992",
  "/dashboard/admin/workflows": "RA-7992",
  "/dashboard/reports/[id]/completeness": "RA-8080",
  "/dashboard/reports/[id]/version-history": "RA-8080",
  "/dashboard/invoices/recurring": "RA-7959",
  "/dev/report-experience": "RA-8106: development-only synthetic preview; notFound() outside development",
  "/dev/report-experience/[reportId]": "RA-8104: development-only view of one authorised report; notFound() outside development",
  "/dashboard/admin/live-teacher": PRE_EXISTING,
  "/dashboard/assistant": PRE_EXISTING,
  "/dashboard/billing": PRE_EXISTING,
  "/dashboard/credits": PRE_EXISTING,
  "/dashboard/form-templates": PRE_EXISTING,
  "/dashboard/form-templates/new": PRE_EXISTING,
  "/dashboard/forms/authority": PRE_EXISTING,
  "/dashboard/forms/submissions": PRE_EXISTING,
  "/dashboard/integrations/health": PRE_EXISTING,
  "/dashboard/integrations/sync-errors": PRE_EXISTING,
  "/dashboard/integrations/sync-history": PRE_EXISTING,
  "/dashboard/integrations/webhooks": PRE_EXISTING,
  "/dashboard/invoices/analytics": PRE_EXISTING,
  "/dashboard/invoices/payments": PRE_EXISTING,
  "/dashboard/invoices/templates": PRE_EXISTING,
  "/dashboard/mobile": PRE_EXISTING,
  "/dashboard/notifications": PRE_EXISTING,
  "/dashboard/property-lookup": PRE_EXISTING,
  "/dashboard/reports/completeness-check": PRE_EXISTING,
  "/dashboard/scope-templates": PRE_EXISTING,
  "/dashboard/search": PRE_EXISTING,
  "/dashboard/security": PRE_EXISTING,
  "/dashboard/settings/email-templates": PRE_EXISTING,
  "/dashboard/settings/floor-plan": PRE_EXISTING,
  "/dashboard/settings/insurer-profiles": PRE_EXISTING,
  "/dashboard/settings/xero-mapping": PRE_EXISTING,
  "/dashboard/support": PRE_EXISTING,
  "/dashboard/team/[id]": PRE_EXISTING,
  "/dashboard/telemetry": PRE_EXISTING,
  "/evidence-score": PRE_EXISTING,
  "/pilot/adjuster-review": PRE_EXISTING,
  "/portal/[token]/learn": PRE_EXISTING,
  "/portal/help/[slug]": PRE_EXISTING,
  "/portal/reset-password": PRE_EXISTING,
  "/resources/avian-influenza-site-documentation": PRE_EXISTING,
};

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** app/(group)/dashboard/[id]/page.tsx -> /dashboard/[id] */
function routeOf(pageFile: string): string {
  const segments = relative(appDir, pageFile)
    .split(sep)
    .slice(0, -1)
    .filter((s) => !/^\(.*\)$/.test(s) && !s.startsWith("@"));
  return "/" + segments.join("/");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The route as a regex: [x] matches ${...}; the match must end at the route. */
function routePattern(route: string): RegExp {
  const body = route
    .split("/")
    .map((seg) => (/^\[.+\]$/.test(seg) ? "\\$\\{[^}]+\\}" : escapeRegExp(seg)))
    .join("/");
  return new RegExp(`${body}(?=["'\`?#)]|$)`, "m");
}

const pages = walk(appDir, []).filter((f) => f.endsWith(`${sep}page.tsx`));

const sources = [
  ...SOURCE_ROOTS.flatMap((root) => walk(join(repoRoot, root), [])),
  ...SOURCE_FILES.map((f) => join(repoRoot, f)),
]
  .filter((f) => SOURCE_EXT.test(f) && !TEST_FILE.test(f))
  .map((file) => ({ file, text: readFileSync(file, "utf8") }));

function isReferenced(pageFile: string): boolean {
  const route = routeOf(pageFile);
  const ownFolder = pageFile.slice(0, -"page.tsx".length);
  const pattern = routePattern(route);
  return sources.some(
    ({ file, text }) => !file.startsWith(ownFolder) && pattern.test(text),
  );
}

const routes = pages
  .filter((p) => routeOf(p) !== "/")
  .map((p) => ({ route: routeOf(p), referenced: isReferenced(p) }));

describe("every app page is reachable by a link (RA-8081)", () => {
  it("finds the pages and the source it searches (positive control)", () => {
    expect(pages.length).toBeGreaterThan(150);
    expect(sources.length).toBeGreaterThan(1000);
    expect(
      routes.find((r) => r.route === "/dashboard/inspections/[id]/capture")
        ?.referenced,
    ).toBe(true);
  });

  it("does not count a link to the parent as a link to a dynamic sub-route", () => {
    const p = routePattern("/dashboard/inspections/[id]/print");
    expect(p.test("href={`/dashboard/inspections/${inspection.id}`}")).toBe(false);
    expect(p.test("href={`/dashboard/inspections/${inspection.id}/printer`}")).toBe(false);
    expect(p.test("href={`/dashboard/inspections/${inspection.id}/print`}")).toBe(true);
    expect(p.test("`/dashboard/inspections/${id}/print?auto=1`")).toBe(true);
  });

  it("has no unlinked page outside the allowlist", () => {
    const orphans = routes
      .filter((r) => !r.referenced && !(r.route in ALLOWLIST))
      .map((r) => r.route)
      .sort();
    expect(orphans).toEqual([]);
  });

  it("has no allowlist entry that is now linked or no longer exists", () => {
    const byRoute = new Map(routes.map((r) => [r.route, r.referenced]));
    const stale = Object.keys(ALLOWLIST)
      .filter((route) => byRoute.get(route) !== false)
      .sort();
    expect(stale).toEqual([]);
  });
});
