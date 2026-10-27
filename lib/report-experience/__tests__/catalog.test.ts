import { describe, expect, it } from "vitest";
import {
  ALWAYS_VISIBLE_REPORT_SECTIONS,
  DEFAULT_REPORT_THEME,
  REPORT_MODULES,
  REPORT_THEMES,
  planReportExperience,
  type ReportModuleId,
} from "../catalog";

const allModules = Object.keys(REPORT_MODULES) as ReportModuleId[];

describe("report experience catalogue", () => {
  it("exposes all ten founder-selected, uniquely named presentation modes", () => {
    expect(REPORT_THEMES).toHaveLength(10);
    expect(new Set(REPORT_THEMES.map((theme) => theme.id)).size).toBe(10);
    expect(new Set(REPORT_THEMES.map((theme) => theme.label)).size).toBe(10);
  });

  it("has a non-empty, explicit PDF fallback for every interactive module", () => {
    expect(allModules.length).toBeGreaterThan(8);
    for (const module of allModules) {
      expect(REPORT_MODULES[module].staticEquivalent.trim().length).toBeGreaterThan(14);
    }
    for (const theme of REPORT_THEMES) {
      expect(theme.featuredModules.length).toBeGreaterThan(0);
      for (const module of theme.featuredModules) {
        expect(allModules).toContain(module);
      }
    }
  });

  it("always carries safety, evidence, limitations and signoff sections across all themes and viewers", () => {
    for (const theme of REPORT_THEMES) {
      for (const viewer of ["web", "mobile", "pdf"] as const) {
        const result = planReportExperience({
          themeId: theme.id,
          viewer,
          authorisedAvailableModules: allModules,
        });
        expect(result.requiredSections).toEqual(ALWAYS_VISIBLE_REPORT_SECTIONS);
        expect(result.requiredSections).toContain("safety-warnings-and-actions");
        expect(result.requiredSections).toContain("limitations-and-unknowns");
        expect(result.requiredSections).toContain("sources-and-signoff");
      }
    }
  });

  it("cannot display any module absent from the server-authorised evidence set", () => {
    const result = planReportExperience({
      themeId: "interactive-3d-models",
      viewer: "web",
      authorisedAvailableModules: ["floorplan-2d"],
    });
    expect(result.interactiveModules).toEqual(["floorplan-2d"]);
    expect(result.staticModules.map((item) => item.id)).toEqual(["floorplan-2d"]);
  });

  it("does not manufacture charts, 3D or maps when the report contains no approved evidence", () => {
    for (const theme of REPORT_THEMES) {
      const result = planReportExperience({
        themeId: theme.id,
        viewer: "web",
        authorisedAvailableModules: [],
      });
      expect(result.interactiveModules).toEqual([]);
      expect(result.staticModules).toEqual([]);
    }
  });

  it("uses static-only output for PDF regardless of requested theme or available evidence", () => {
    for (const theme of REPORT_THEMES) {
      const result = planReportExperience({
        themeId: theme.id,
        viewer: "pdf",
        authorisedAvailableModules: allModules,
      });
      expect(result.interactiveModules).toEqual([]);
      expect(result.motionAllowed).toBe(false);
      expect(result.staticModules).toHaveLength(theme.featuredModules.length);
    }
  });

  it("honours reduced-motion preference without deleting the underlying facts", () => {
    const result = planReportExperience({
      themeId: "visual-storytelling",
      viewer: "web",
      prefersReducedMotion: true,
      authorisedAvailableModules: allModules,
    });
    expect(result.motionAllowed).toBe(false);
    expect(result.staticModules).toHaveLength(result.interactiveModules.length);
  });

  it("does not default to dark tech or crash for an unknown theme identifier", () => {
    const invalid = planReportExperience({
      themeId: "__unknown_external_id__",
      viewer: "web",
      authorisedAvailableModules: allModules,
    });
    expect(invalid.theme.id).toBe(DEFAULT_REPORT_THEME);
    expect(REPORT_THEMES.find((theme) => theme.id === "dark-tech")?.optIn).toBe(true);
  });

  it("treats client branding as presentation, not special data authority", () => {
    const result = planReportExperience({
      themeId: "branded-custom",
      viewer: "mobile",
      authorisedAvailableModules: [],
    });
    expect(result.interactiveModules).toEqual([]);
    expect(result.requiredSections).toEqual(ALWAYS_VISIBLE_REPORT_SECTIONS);
  });
});
