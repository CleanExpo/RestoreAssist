export const HELP_CATEGORIES = [
  "getting-started",
  "inspections",
  "reports",
  "clients-and-portal",
  "billing",
  "team",
  "integrations",
  "compliance",
] as const;

export type HelpCategory = (typeof HELP_CATEGORIES)[number];

export type HelpAudience = "tradie" | "admin" | "client";

export type HelpFrontmatter = {
  title: string;
  slug: string;
  category: HelpCategory;
  order: number;
  audience: HelpAudience[];
  readTimeMin: number;
  updatedAt: string;
  status: "draft" | "published" | "archived";
  heroImage?: string;
  relatedSlugs: string[];
  aiSummary: string;
  userIntents: string[];
  successCriteria: string[];
};

export const HELP_CATEGORY_LABELS: Record<HelpCategory, string> = {
  "getting-started": "Getting started",
  inspections: "Inspections",
  reports: "Reports",
  "clients-and-portal": "Clients & Portal",
  billing: "Billing",
  team: "Team",
  integrations: "Integrations",
  compliance: "Compliance",
};
