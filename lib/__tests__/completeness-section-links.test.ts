/**
 * RA-8545 — report completeness "fix this" links.
 *
 * The two completeness pages used to hand-build their links (getFixLink).
 * Two of them put a report id into an inspection URL, and the report links
 * passed a ?tab= the report page never reads. These tests pin the links to
 * the tested owner in lib/dashboard/completeness-blocker-links.ts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeReportCompletenessSections } from "../reports/completeness";
import { completenessSectionHref } from "../dashboard/completeness-blocker-links";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const COMPLETENESS_PAGES = [
  "app/dashboard/reports/completeness-check/page.tsx",
  "app/dashboard/reports/[id]/completeness/page.tsx",
];

/** The ?tab= values the inspection page actually reads (its allow-list). */
function inspectionPageTabs(): string[] {
  const src = read("app/dashboard/inspections/[id]/page.tsx");
  const match = src.match(/const allowed: Tab\[\] = \[([\s\S]*?)\];/);
  if (!match) throw new Error("inspection page tab allow-list not found");
  const tabs = [...match[1].matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
  expect(tabs.length).toBeGreaterThan(5);
  return tabs;
}

/** True when the report page reads a ?tab= query parameter at all. */
function reportPageReadsTab(): boolean {
  return /get\(\s*["']tab["']\s*\)/.test(
    read("app/dashboard/reports/[id]/page.tsx"),
  );
}

// Every section the scorer can produce, all failing, so each wants a link.
const SECTIONS = computeReportCompletenessSections({
  client: null,
  inspection: null,
});

describe("completeness pages use the shared link owner (RA-8545)", () => {
  for (const page of COMPLETENESS_PAGES) {
    it(`${page} has no hand-built fix links`, () => {
      const src = read(page);
      expect(src).not.toMatch(/getFixLink/);
      // A report id must never be put into an inspection route.
      expect(src).not.toMatch(/\/dashboard\/inspections\/\$\{reportId\}/);
      // The report page does not read ?tab=, so no link may pass one to it.
      expect(src).not.toMatch(/\/dashboard\/reports\/\$\{[^}]+\}\?tab=/);
      expect(src).toMatch(/completenessSectionHref\(/);
    });
  }
});

describe("completenessSectionHref", () => {
  it("covers every section the scorer produces", () => {
    expect(SECTIONS.length).toBeGreaterThan(5);
  });

  it("only links to the linked inspection, never to an id it was not given", () => {
    for (const section of SECTIONS) {
      const href = completenessSectionHref(section.name, "insp-1");
      if (href === null) continue;
      expect(href.startsWith("/dashboard/inspections/insp-1")).toBe(true);
      expect(href).not.toMatch(/^\/dashboard\/reports\//);
    }
  });

  it("only uses tabs the target page reads", () => {
    const tabs = inspectionPageTabs();
    for (const section of SECTIONS) {
      const href = completenessSectionHref(section.name, "insp-1");
      if (href === null) continue;
      const url = new URL(href, "https://example.test");
      const tab = url.searchParams.get("tab");
      if (url.pathname.startsWith("/dashboard/reports/")) {
        expect(tab === null || reportPageReadsTab()).toBe(true);
      } else if (tab !== null) {
        expect(tabs).toContain(tab);
      }
    }
  });

  it("gives the sections that had links before a link to the job", () => {
    expect(completenessSectionHref("IICRC Classification", "insp-1")).toBe(
      "/dashboard/inspections/insp-1?tab=classification",
    );
    expect(completenessSectionHref("Site Photos", "insp-1")).toBe(
      "/dashboard/inspections/insp-1?tab=photos",
    );
    expect(completenessSectionHref("Scope of Works", "insp-1")).toBe(
      "/dashboard/inspections/insp-1?tab=scope",
    );
    expect(completenessSectionHref("Cost Estimates", "insp-1")).toBe(
      "/dashboard/inspections/insp-1?tab=costs",
    );
  });

  it("shows no link when the report has no inspection", () => {
    for (const section of SECTIONS) {
      expect(completenessSectionHref(section.name, null)).toBeNull();
    }
  });

  it("shows no link for a section it does not know", () => {
    expect(completenessSectionHref("Something New", "insp-1")).toBeNull();
  });
});
