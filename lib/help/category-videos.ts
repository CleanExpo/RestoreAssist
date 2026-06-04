/**
 * Maps VideoExplainer slugs to HelpCategory values.
 * Used by HowToDropdown and category pages to surface
 * relevant video walkthroughs alongside written articles.
 */
import { type VideoExplainerSlug } from "@/components/setup/video-registry";
import { type HelpCategory } from "@/lib/help/types";

export const CATEGORY_VIDEOS: Record<HelpCategory, VideoExplainerSlug[]> = {
  "getting-started": [
    "remotion-tutorial-login",
    "remotion-tutorial-signup",
    "remotion-tutorial-setup-wizard",
    "remotion-tutorial-dashboard",
    "remotion-hero-product-overview",
  ],
  inspections: [
    "remotion-tutorial-inspections",
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
    "remotion-tutorial-reports",
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
    "remotion-tutorial-billing",
    "remotion-pricing-overview",
    "remotion-invoice-generator",
    "remotion-quote-builder",
    "remotion-roi-explainer",
  ],
  team: [
    "remotion-tutorial-team",
    "remotion-team-management",
    "remotion-bulk-operations",
    "remotion-search-filter",
    "remotion-notifications-deep-dive",
  ],
  integrations: [
    "remotion-tutorial-integrations",
    "remotion-integration-connect",
    "remotion-api-webhooks",
    "remotion-data-import",
    "remotion-white-label",
  ],
  compliance: [
    "remotion-tutorial-compliance",
    "remotion-compliance-checklists",
    "remotion-training-s500-standard",
    "remotion-training-water-damage-cat",
    "remotion-training-mould-remediation",
    "remotion-training-fire-smoke",
    "remotion-evidence-chain",
    "remotion-backup-export",
  ],
};
