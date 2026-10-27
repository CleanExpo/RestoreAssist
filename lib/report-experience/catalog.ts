/**
 * RA-8104 / RA-8105: Report presentation registry.
 *
 * This file does not grant report access, change evidence, or claim that an
 * interactive component exists. Its "available" argument must eventually be
 * computed by the server from authorised, verified report evidence.
 */
export const REPORT_MODULES = {
  "gantt-timeline": { staticEquivalent: "Dated milestone and work-schedule table", motion: true },
  "moisture-trends": { staticEquivalent: "Dated moisture readings and trend chart", motion: true },
  "before-during-after": { staticEquivalent: "Timestamped before/during/after photo sequence", motion: true },
  "floorplan-2d": { staticEquivalent: "Scaled and labelled static floor-plan image", motion: false },
  "model-3d": { staticEquivalent: "Labelled 2D floor plans and verified views", motion: true },
  "safety-hotspots": { staticEquivalent: "Accessible numbered hazard register with actions", motion: true },
  "site-map": { staticEquivalent: "Permitted, redacted site location plan", motion: true },
  "evidence-video": { staticEquivalent: "Still frames, dated evidence index and transcript", motion: true },
  "evidence-audio": { staticEquivalent: "Transcript with speaker and time provenance", motion: true },
  "equipment-register": { staticEquivalent: "Equipment by room, dates and condition table", motion: true },
  "cost-and-resources": { staticEquivalent: "Itemised scope, estimate and resource table", motion: true },
} as const;

export type ReportModuleId = keyof typeof REPORT_MODULES;
export type ReportViewer = "web" | "mobile" | "pdf";
export type ReportLayout = "summary" | "document" | "story" | "dashboard" | "spatial";
export type ReportTheme = {
  id: string;
  label: string;
  layout: ReportLayout;
  description: string;
  featuredModules: readonly ReportModuleId[];
  printVariant: "light" | "neutral";
  optIn?: boolean;
};

/**
 * An ordered list, corresponding exactly to the founder-approved ten styles.
 * Styles determine presentation, NOT which report data a reader may access.
 */
export const REPORT_THEMES = [
  {
    id: "executive-modern",
    label: "Executive Modern",
    layout: "summary",
    description: "High-trust summaries, milestones and next actions.",
    featuredModules: ["gantt-timeline", "cost-and-resources"],
    printVariant: "light",
  },
  {
    id: "dark-tech",
    label: "Dark Tech",
    layout: "dashboard",
    description: "Optional low-light technical presentation; never required for safety.",
    featuredModules: ["gantt-timeline", "moisture-trends", "model-3d"],
    printVariant: "neutral",
    optIn: true,
  },
  {
    id: "minimal-clean",
    label: "Minimal Clean",
    layout: "document",
    description: "Readable, distraction-free report with short summaries.",
    featuredModules: ["gantt-timeline", "moisture-trends"],
    printVariant: "light",
  },
  {
    id: "visual-storytelling",
    label: "Visual Storytelling",
    layout: "story",
    description: "Evidence-led assessment to completion progression.",
    featuredModules: ["before-during-after", "gantt-timeline", "evidence-video"],
    printVariant: "light",
  },
  {
    id: "technical-dashboard",
    label: "Technical Dashboard",
    layout: "dashboard",
    description: "Detailed readings, equipment and resource comparisons.",
    featuredModules: ["moisture-trends", "equipment-register", "cost-and-resources"],
    printVariant: "light",
  },
  {
    id: "interactive-3d-models",
    label: "Interactive 3D & Models",
    layout: "spatial",
    description: "Verified room and damage overlays with accessible 2D fallback.",
    featuredModules: ["floorplan-2d", "model-3d", "safety-hotspots"],
    printVariant: "light",
  },
  {
    id: "safety-compliance",
    label: "Safety & Compliance",
    layout: "document",
    description: "Immediate hazard, response and verification focus.",
    featuredModules: ["safety-hotspots", "floorplan-2d", "equipment-register"],
    printVariant: "light",
  },
  {
    id: "before-during-after",
    label: "Before / During / After",
    layout: "story",
    description: "Provenance-labelled comparison of documented condition.",
    featuredModules: ["before-during-after", "evidence-video", "moisture-trends"],
    printVariant: "light",
  },
  {
    id: "map-location",
    label: "Map & Location",
    layout: "spatial",
    description: "Permissioned spatial understanding, never mandatory geolocation.",
    featuredModules: ["site-map", "floorplan-2d", "safety-hotspots"],
    printVariant: "light",
  },
  {
    id: "branded-custom",
    label: "Branded Custom Theme",
    layout: "summary",
    description: "Organisation-approved presentation, independent of report ownership.",
    featuredModules: ["gantt-timeline", "before-during-after", "cost-and-resources"],
    printVariant: "light",
  },
] as const satisfies readonly ReportTheme[];

export type ReportThemeId = (typeof REPORT_THEMES)[number]["id"];
export const DEFAULT_REPORT_THEME: ReportThemeId = "minimal-clean";

/** Safety and evidence essentials are never removed when switching styles. */
export const ALWAYS_VISIBLE_REPORT_SECTIONS = [
  "report-identity-and-revision",
  "findings-and-evidence",
  "safety-warnings-and-actions",
  "limitations-and-unknowns",
  "sources-and-signoff",
] as const;

export type ExperienceRequest = {
  themeId?: string | null;
  viewer: ReportViewer;
  /** Server-produced set of permissioned modules backed by real report evidence. */
  authorisedAvailableModules: readonly ReportModuleId[];
  prefersReducedMotion?: boolean;
};

export type ExperiencePlan = {
  theme: ReportTheme;
  viewer: ReportViewer;
  interactiveModules: readonly ReportModuleId[];
  staticModules: readonly { id: ReportModuleId; description: string }[];
  requiredSections: typeof ALWAYS_VISIBLE_REPORT_SECTIONS;
  motionAllowed: boolean;
};

/** Design-only selection. Server must enforce report/role/tenant rights first. */
export function planReportExperience(request: ExperienceRequest): ExperiencePlan {
  const theme = REPORT_THEMES.find((item) => item.id === request.themeId)
    ?? REPORT_THEMES.find((item) => item.id === DEFAULT_REPORT_THEME)!;
  const available = new Set<ReportModuleId>(request.authorisedAvailableModules);
  const modules = theme.featuredModules.filter((id) => available.has(id));
  const motionAllowed = request.viewer !== "pdf" && !request.prefersReducedMotion;
  return {
    theme,
    viewer: request.viewer,
    interactiveModules: request.viewer === "pdf" ? [] : modules,
    staticModules: modules.map((id) => ({
      id,
      description: REPORT_MODULES[id].staticEquivalent,
    })),
    requiredSections: ALWAYS_VISIBLE_REPORT_SECTIONS,
    motionAllowed,
  };
}
