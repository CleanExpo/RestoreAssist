/**
 * Maps VideoExplainer slugs to HelpCategory values.
 * Used by HowToDropdown and category pages to surface
 * relevant video walkthroughs alongside written articles.
 */
import { type VideoExplainerSlug } from "@/components/setup/video-registry";
import { type HelpCategory } from "@/lib/help/types";

export const CATEGORY_VIDEOS: Record<HelpCategory, VideoExplainerSlug[]> = {
  "getting-started": [
    "remotion-sign-up",
    "remotion-sign-in",
    "remotion-dashboard",
    "remotion-setup-wizard-full",
    "remotion-hero-product-overview",
  ],
  inspections: [
    "remotion-create-inspection",
    "remotion-inspections-list",
    "remotion-evidence-capture",
    "remotion-moisture-mapping",
    "remotion-evidence-chain-deep-dive",
    "remotion-photo-annotation-deep-dive",
    "remotion-moisture-deep-dive",
    "remotion-mobile-deep-dive",
  ],
  reports: [
    "remotion-report-builder",
    "remotion-report-export-pdf",
    "remotion-template-builder",
    "remotion-analytics-overview",
  ],
  "clients-and-portal": [
    "remotion-client-portal",
    "remotion-for-contractors",
    "remotion-for-assessors",
    "remotion-for-property-managers",
  ],
  billing: [
    "remotion-pricing-overview",
    "remotion-invoice-generator",
    "remotion-quote-builder",
    "remotion-roi-explainer",
  ],
  team: [
    "remotion-team-management",
    "remotion-bulk-operations",
    "remotion-search-filter",
    "remotion-notifications-deep-dive",
  ],
  integrations: [
    "remotion-integration-connect",
    "remotion-api-webhooks",
    "remotion-data-import",
    "remotion-white-label",
  ],
  compliance: [
    "remotion-compliance-checklists",
    "remotion-training-s500-standard",
    "remotion-training-water-damage-cat",
    "remotion-training-mould-remediation",
    "remotion-training-fire-smoke",
    "remotion-evidence-chain",
    "remotion-backup-export",
  ],
};
