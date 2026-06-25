/**
 * Caption Registry — maps video slugs to VTT caption file URLs.
 * Generated from narration scripts. Contains 60 caption files.
 */

export const CAPTION_REGISTRY: Record<string, string> = {
  // Tutorials
  "tutorial-login": "/videos/captions/tutorial-login.vtt",
  "tutorial-signup": "/videos/captions/tutorial-signup.vtt",
  "tutorial-setup-wizard": "/videos/captions/tutorial-setup-wizard.vtt",
  "tutorial-dashboard": "/videos/captions/tutorial-dashboard.vtt",
  "tutorial-inspections": "/videos/captions/tutorial-inspections.vtt",
  "tutorial-reports": "/videos/captions/tutorial-reports.vtt",
  "tutorial-billing": "/videos/captions/tutorial-billing.vtt",
  "tutorial-team": "/videos/captions/tutorial-team.vtt",
  "tutorial-compliance": "/videos/captions/tutorial-compliance.vtt",
  "tutorial-integrations": "/videos/captions/tutorial-integrations.vtt",
  // Wizards
  "wizard-signin": "/videos/captions/wizard-signin.vtt",
  "wizard-signup": "/videos/captions/wizard-signup.vtt",
  "wizard-setup": "/videos/captions/wizard-setup.vtt",
  "wizard-dashboard": "/videos/captions/wizard-dashboard.vtt",
  "wizard-integrations": "/videos/captions/wizard-integrations.vtt",
  "wizard-health": "/videos/captions/wizard-health.vtt",
  // Core
  "dashboard-walkthrough": "/videos/captions/dashboard-walkthrough.vtt",
  "create-inspection": "/videos/captions/create-inspection.vtt",
  "report-builder": "/videos/captions/report-builder.vtt",
  "client-portal": "/videos/captions/client-portal.vtt",
  "hero-product-overview": "/videos/captions/hero-product-overview.vtt",
  "setup-wizard-full": "/videos/captions/setup-wizard-full.vtt",
  "settings-config": "/videos/captions/settings-config.vtt",
  "integration-connect": "/videos/captions/integration-connect.vtt",
  "report-export-pdf": "/videos/captions/report-export-pdf.vtt",
  "why-restoreassist": "/videos/captions/why-restoreassist.vtt",
  "byok-explainer": "/videos/captions/byok-explainer.vtt",
  "sign-up": "/videos/captions/sign-up.vtt",
  "sign-in": "/videos/captions/sign-in.vtt",
  // Features
  "inspections-list": "/videos/captions/inspections-list.vtt",
  "evidence-capture": "/videos/captions/evidence-capture.vtt",
  "moisture-mapping": "/videos/captions/moisture-mapping.vtt",
  "quote-builder": "/videos/captions/quote-builder.vtt",
  "invoice-generator": "/videos/captions/invoice-generator.vtt",
  "compliance-checklists": "/videos/captions/compliance-checklists.vtt",
  "analytics-overview": "/videos/captions/analytics-overview.vtt",
  "team-management": "/videos/captions/team-management.vtt",
  "pricing-overview": "/videos/captions/pricing-overview.vtt",
  "roi-explainer": "/videos/captions/roi-explainer.vtt",
  "moisture-deep-dive": "/videos/captions/moisture-deep-dive.vtt",
  "evidence-chain-deep-dive": "/videos/captions/evidence-chain-deep-dive.vtt",
  "photo-annotation-deep-dive": "/videos/captions/photo-annotation-deep-dive.vtt",
  "template-builder": "/videos/captions/template-builder.vtt",
  "bulk-operations": "/videos/captions/bulk-operations.vtt",
  "search-filter": "/videos/captions/search-filter.vtt",
  "notifications-deep-dive": "/videos/captions/notifications-deep-dive.vtt",
  "data-import": "/videos/captions/data-import.vtt",
  "api-webhooks": "/videos/captions/api-webhooks.vtt",
  "white-label": "/videos/captions/white-label.vtt",
  "backup-export": "/videos/captions/backup-export.vtt",
  "mobile-deep-dive": "/videos/captions/mobile-deep-dive.vtt",
  // Training
  "training-s500-standard": "/videos/captions/training-s500-standard.vtt",
  "training-water-damage-cat": "/videos/captions/training-water-damage-cat.vtt",
  "training-mould-remediation": "/videos/captions/training-mould-remediation.vtt",
  "training-fire-smoke": "/videos/captions/training-fire-smoke.vtt",
  "evidence-chain": "/videos/captions/evidence-chain.vtt",
  // Audience
  "for-contractors": "/videos/captions/for-contractors.vtt",
  "for-assessors": "/videos/captions/for-assessors.vtt",
  "for-property-managers": "/videos/captions/for-property-managers.vtt",
  "for-insurers": "/videos/captions/for-insurers.vtt",
  // New-client welcome (top of /setup) — keyed by the VideoExplainerSlug
  "remotion-onboarding-welcome": "/videos/captions/onboarding-welcome.vtt",
};

export function getCaptionUrl(slug: string): string | null {
  return CAPTION_REGISTRY[slug] || null;
}
