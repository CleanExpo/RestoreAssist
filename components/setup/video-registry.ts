/**
 * Slug-addressable registry of RestoreAssist tutorial videos.
 *
 * Lives in its own (non-"use client") file so both server components
 * (e.g. /app/dashboard/learn/page.tsx) and the client `<VideoExplainer>`
 * can import it. Putting these constants inside the "use client" file
 * makes them invisible to server components — Next.js's RSC bundler
 * elides the initializer for the server-side bundle.
 *
 * Entries can be either:
 *   - YouTube-hosted (set `youtubeId`) — Unlisted on YouTube, embedded via
 *     youtube-nocookie.com.
 *   - Repo-hosted (set `localPath`) — served from /public/videos/... and
 *     rendered with a native <video> element. Used when YouTube upload
 *     is pending; replace with `youtubeId` after the unlisted upload lands.
 */

export type VideoExplainerSlug =
  | "setup-wizard-signin"
  | "setup-wizard-signup"
  | "setup-wizard-setup"
  | "setup-wizard-dashboard"
  | "setup-wizard-integrations"
  | "setup-wizard-health"
  | "help-inspections"
  | "help-reports"
  | "help-clients-and-portal"
  | "help-billing"
  | "help-team"
  | "help-compliance"
  // Remotion rendered videos (brand-correct, audio, production-ready)
  | "remotion-sign-in"
  | "remotion-sign-up"
  | "remotion-dashboard"
  | "remotion-create-inspection"
  | "remotion-report-builder"
  | "remotion-client-portal"
  | "remotion-why-restoreassist"
  | "remotion-byok"
  | "remotion-inspections-list"
  | "remotion-evidence-capture"
  | "remotion-moisture-mapping"
  | "remotion-quote-builder"
  | "remotion-invoice-generator"
  | "remotion-compliance-checklists"
  | "remotion-analytics-overview"
  | "remotion-team-management"
  | "remotion-mobile-workflow"
  | "remotion-pricing-overview"
  // P0 Launch Blockers (2026-06-04)
  | "remotion-hero-product-overview"
  | "remotion-setup-wizard-full"
  | "remotion-settings-config"
  | "remotion-integration-connect"
  | "remotion-report-export-pdf"
  // P1 Marketing Videos (2026-06-04)
  | "remotion-for-contractors"
  | "remotion-for-assessors"
  | "remotion-for-property-managers"
  | "remotion-roi-explainer"
  | "remotion-evidence-chain"
  | "remotion-linkedin-short-1"
  | "remotion-linkedin-short-2"
  // P3 Training Videos (2026-06-04)
  | "remotion-training-s500-standard"
  | "remotion-training-water-damage-cat"
  | "remotion-training-mould-remediation"
  | "remotion-training-fire-smoke"
  // P2 Feature Deep-Dives (2026-06-04)
  | "remotion-evidence-chain-deep-dive"
  | "remotion-photo-annotation-deep-dive"
  | "remotion-template-builder"
  | "remotion-bulk-operations"
  | "remotion-search-filter"
  | "remotion-notifications-deep-dive"
  | "remotion-data-import"
  | "remotion-api-webhooks"
  | "remotion-white-label"
  | "remotion-backup-export"
  | "remotion-moisture-deep-dive"
  | "remotion-mobile-deep-dive"
  // Tutorial Videos (2026-06-04)
  | "remotion-tutorial-login"
  | "remotion-tutorial-signup"
  | "remotion-tutorial-setup-wizard"
  | "remotion-tutorial-dashboard"
  | "remotion-tutorial-inspections"
  | "remotion-tutorial-reports"
  | "remotion-tutorial-billing"
  | "remotion-tutorial-team"
  | "remotion-tutorial-compliance"
  | "remotion-tutorial-integrations"
  // New-client welcome (shown at the top of /setup)
  | "remotion-onboarding-welcome";

export interface RegistryEntry {
  youtubeId?: string;
  /**
   * Cloudinary CDN URL for fast global delivery.
   * Set this OR youtubeId OR localPath, not multiple.
   */
  cloudinaryUrl?: string;
  /**
   * Path beneath `/public` (with leading slash) to a repo-hosted MP4.
   * Set EITHER this OR `youtubeId` OR `cloudinaryUrl`, not multiple.
   */
  localPath?: string;
  title: string;
  durationSec: number;
  category?: string;
}

export const VIDEO_REGISTRY: Record<VideoExplainerSlug, RegistryEntry> = {
  "setup-wizard-signin": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780555742/restoreassist/videos/remotion/wizard-signin.mp4",
    localPath: "/videos/remotion/wizard-signin.mp4",
    title: "Signing in to RestoreAssist",
    durationSec: 30,
  },
  "setup-wizard-signup": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780555743/restoreassist/videos/remotion/wizard-signup.mp4",
    localPath: "/videos/remotion/wizard-signup.mp4",
    title: "Creating your RestoreAssist account",
    durationSec: 60,
  },
  "setup-wizard-setup": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780555745/restoreassist/videos/remotion/wizard-setup.mp4",
    localPath: "/videos/remotion/wizard-setup.mp4",
    title: "The RestoreAssist Setup Wizard — end-to-end",
    durationSec: 120,
  },
  "setup-wizard-dashboard": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780555746/restoreassist/videos/remotion/wizard-dashboard.mp4",
    localPath: "/videos/remotion/wizard-dashboard.mp4",
    title: "Your RestoreAssist dashboard, post-activation",
    durationSec: 120,
  },
  "setup-wizard-integrations": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780555747/restoreassist/videos/remotion/wizard-integrations.mp4",
    localPath: "/videos/remotion/wizard-integrations.mp4",
    title: "Connect Xero, MYOB, QuickBooks, ServiceM8 or Ascora",
    durationSec: 90,
  },
  "setup-wizard-health": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780555749/restoreassist/videos/remotion/wizard-health.mp4",
    localPath: "/videos/remotion/wizard-health.mp4",
    title: "Your RestoreAssist Workspace Health page",
    durationSec: 60,
  },
  "help-inspections": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780978575/restoreassist/videos/help/help-inspections.mp4",
    localPath: "/videos/help/help-inspections.mp4",
    title: "Inspections — chain-of-custody capture",
    durationSec: 75,
  },
  "help-reports": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780978580/restoreassist/videos/help/help-reports.mp4",
    localPath: "/videos/help/help-reports.mp4",
    title: "AI-drafted S500 reports — review and sign off",
    durationSec: 75,
  },
  "help-clients-and-portal": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780978538/restoreassist/videos/help/help-clients-and-portal.mp4",
    localPath: "/videos/help/help-clients-and-portal.mp4",
    title: "Share reports via the client portal",
    durationSec: 75,
  },
  "help-billing": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780978485/restoreassist/videos/help/help-billing.mp4",
    localPath: "/videos/help/help-billing.mp4",
    title: "Trial, paid tiers, and Stripe Checkout",
    durationSec: 75,
  },
  "help-team": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780978626/restoreassist/videos/help/help-team.mp4",
    localPath: "/videos/help/help-team.mp4",
    title: "Invite a technician + verify their licence",
    durationSec: 75,
  },
  "help-compliance": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780978552/restoreassist/videos/help/help-compliance.mp4",
    localPath: "/videos/help/help-compliance.mp4",
    title: "IICRC citation format and edition discipline",
    durationSec: 75,
  },

  // ── Remotion rendered videos (brand-correct, audio, production-ready) ──
  "remotion-sign-in": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780543346/restoreassist/videos/remotion/sign-in.mp4",
    localPath: "/videos/remotion/sign-in.mp4",
    title: "Signing in to RestoreAssist",
    durationSec: 45,
  },
  "remotion-sign-up": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780543347/restoreassist/videos/remotion/sign-up.mp4",
    localPath: "/videos/remotion/sign-up.mp4",
    title: "Creating your RestoreAssist account",
    durationSec: 60,
  },
  "remotion-dashboard": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780543299/restoreassist/videos/remotion/dashboard-walkthrough.mp4",
    localPath: "/videos/remotion/dashboard-walkthrough.mp4",
    title: "Your RestoreAssist dashboard",
    durationSec: 32,
  },
  "remotion-create-inspection": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780543297/restoreassist/videos/remotion/create-inspection.mp4",
    localPath: "/videos/remotion/create-inspection.mp4",
    title: "Creating a new inspection",
    durationSec: 42,
  },
  "remotion-report-builder": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780543331/restoreassist/videos/remotion/report-builder.mp4",
    localPath: "/videos/remotion/report-builder.mp4",
    title: "Building professional reports",
    durationSec: 36,
  },
  "remotion-client-portal": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780543294/restoreassist/videos/remotion/client-portal.mp4",
    localPath: "/videos/remotion/client-portal.mp4",
    title: "Sharing reports via the client portal",
    durationSec: 32,
  },
  "remotion-why-restoreassist": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780543357/restoreassist/videos/remotion/why-restoreassist.mp4",
    localPath: "/videos/remotion/why-restoreassist.mp4",
    title: "Why restoration teams choose RestoreAssist",
    durationSec: 36,
  },
  "remotion-byok": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780543293/restoreassist/videos/remotion/byok-explainer.mp4",
    localPath: "/videos/remotion/byok-explainer.mp4",
    title: "Bring Your Own Knowledge and Equipment",
    durationSec: 42,
  },
  "remotion-inspections-list": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780543309/restoreassist/videos/remotion/inspections-list.mp4",
    localPath: "/videos/remotion/inspections-list.mp4",
    title: "Managing your inspections list",
    durationSec: 34,
  },
  "remotion-evidence-capture": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780543300/restoreassist/videos/remotion/evidence-capture.mp4",
    localPath: "/videos/remotion/evidence-capture.mp4",
    title: "Capturing court-admissible evidence",
    durationSec: 32,
  },
  "remotion-moisture-mapping": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780543325/restoreassist/videos/remotion/moisture-mapping.mp4",
    localPath: "/videos/remotion/moisture-mapping.mp4",
    title: "Moisture mapping and dry goals",
    durationSec: 30,
  },
  "remotion-quote-builder": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780543329/restoreassist/videos/remotion/quote-builder.mp4",
    localPath: "/videos/remotion/quote-builder.mp4",
    title: "Building professional quotes",
    durationSec: 32,
  },
  "remotion-invoice-generator": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780543312/restoreassist/videos/remotion/invoice-generator.mp4",
    localPath: "/videos/remotion/invoice-generator.mp4",
    title: "Generating GST-compliant invoices",
    durationSec: 28,
  },
  "remotion-compliance-checklists": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780543296/restoreassist/videos/remotion/compliance-checklists.mp4",
    localPath: "/videos/remotion/compliance-checklists.mp4",
    title: "IICRC S500 compliance checklists",
    durationSec: 32,
  },
  "remotion-analytics-overview": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780543291/restoreassist/videos/remotion/analytics-overview.mp4",
    localPath: "/videos/remotion/analytics-overview.mp4",
    title: "Business analytics overview",
    durationSec: 45,
  },
  "remotion-team-management": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780543349/restoreassist/videos/remotion/team-management.mp4",
    localPath: "/videos/remotion/team-management.mp4",
    title: "Managing your restoration crew",
    durationSec: 50,
  },
  "remotion-mobile-workflow": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780543324/restoreassist/videos/remotion/mobile-workflow.mp4",
    localPath: "/videos/remotion/mobile-workflow.mp4",
    title: "Mobile workflow for field teams",
    durationSec: 30,
  },
  "remotion-pricing-overview": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780543327/restoreassist/videos/remotion/pricing-overview.mp4",
    localPath: "/videos/remotion/pricing-overview.mp4",
    title: "RestoreAssist pricing and plans",
    durationSec: 60,
  },

  // P0 Launch Blockers (2026-06-04) — brand-correct, audio, production-ready
  "remotion-hero-product-overview": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780543308/restoreassist/videos/remotion/hero-product-overview.mp4",
    localPath: "/videos/remotion/hero-product-overview.mp4",
    title: "RestoreAssist in 60 Seconds",
    durationSec: 60,
  },
  "remotion-setup-wizard-full": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780543345/restoreassist/videos/remotion/setup-wizard-full.mp4",
    localPath: "/videos/remotion/setup-wizard-full.mp4",
    title: "Complete Setup Walkthrough",
    durationSec: 180,
  },
  "remotion-settings-config": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780543337/restoreassist/videos/remotion/settings-config.mp4",
    localPath: "/videos/remotion/settings-config.mp4",
    title: "Settings & Preferences",
    durationSec: 60,
  },
  "remotion-integration-connect": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780543311/restoreassist/videos/remotion/integration-connect.mp4",
    localPath: "/videos/remotion/integration-connect.mp4",
    title: "Connecting Your Tools",
    durationSec: 75,
  },
  "remotion-report-export-pdf": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780543332/restoreassist/videos/remotion/report-export-pdf.mp4",
    localPath: "/videos/remotion/report-export-pdf.mp4",
    title: "Exporting Professional PDF Reports",
    durationSec: 60,
  },

  // P1 Marketing Videos (2026-06-04)
  "remotion-for-contractors": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780543305/restoreassist/videos/remotion/for-contractors.mp4",
    localPath: "/videos/remotion/for-contractors.mp4",
    title: "Built for Restoration Contractors",
    durationSec: 44,
  },
  "remotion-for-assessors": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780543303/restoreassist/videos/remotion/for-assessors.mp4",
    localPath: "/videos/remotion/for-assessors.mp4",
    title: "Built for Building Assessors",
    durationSec: 44,
  },
  "remotion-for-property-managers": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780543306/restoreassist/videos/remotion/for-property-managers.mp4",
    localPath: "/videos/remotion/for-property-managers.mp4",
    title: "Built for Property Managers",
    durationSec: 44,
  },
  "remotion-roi-explainer": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780543335/restoreassist/videos/remotion/roi-explainer.mp4",
    localPath: "/videos/remotion/roi-explainer.mp4",
    title: "Your Time Is Worth More Than Admin",
    durationSec: 44,
  },
  "remotion-evidence-chain": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780543301/restoreassist/videos/remotion/evidence-chain.mp4",
    localPath: "/videos/remotion/evidence-chain.mp4",
    title: "Chain of Custody",
    durationSec: 44,
  },
  "remotion-linkedin-short-1": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780543321/restoreassist/videos/remotion/linkedin-short-1.mp4",
    localPath: "/videos/remotion/linkedin-short-1.mp4",
    title: "14 Hours of Admin Per Job",
    durationSec: 60,
  },
  "remotion-linkedin-short-2": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780543323/restoreassist/videos/remotion/linkedin-short-2.mp4",
    localPath: "/videos/remotion/linkedin-short-2.mp4",
    title: "The Claim That Relied on Chain of Custody",
    durationSec: 60,
  },

  // P3 Training Videos (2026-06-04)
  "remotion-training-s500-standard": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780543354/restoreassist/videos/remotion/training-s500-standard.mp4",
    localPath: "/videos/remotion/training-s500-standard.mp4",
    title: "IICRC S500 Water Categories",
    durationSec: 44,
  },
  "remotion-training-water-damage-cat": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780543355/restoreassist/videos/remotion/training-water-damage-cat.mp4",
    localPath: "/videos/remotion/training-water-damage-cat.mp4",
    title: "IICRC S500 Water Damage Classes",
    durationSec: 44,
  },
  "remotion-training-mould-remediation": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780543352/restoreassist/videos/remotion/training-mould-remediation.mp4",
    localPath: "/videos/remotion/training-mould-remediation.mp4",
    title: "Mould Remediation Protocol",
    durationSec: 44,
  },
  "remotion-training-fire-smoke": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780543351/restoreassist/videos/remotion/training-fire-smoke.mp4",
    localPath: "/videos/remotion/training-fire-smoke.mp4",
    title: "Fire & Smoke Damage Types",
    durationSec: 44,
  },

  // P2 Feature Deep-Dives (2026-06-04)
  "remotion-evidence-chain-deep-dive": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780546129/restoreassist/videos/remotion/evidence-chain-deep-dive.mp4",
    localPath: "/videos/remotion/evidence-chain-deep-dive.mp4",
    title: "Chain of Custody — Deep Dive",
    durationSec: 77,
  },
  "remotion-photo-annotation-deep-dive": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780546131/restoreassist/videos/remotion/photo-annotation-deep-dive.mp4",
    localPath: "/videos/remotion/photo-annotation-deep-dive.mp4",
    title: "Photo Annotation Toolkit",
    durationSec: 77,
  },
  "remotion-template-builder": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780546132/restoreassist/videos/remotion/template-builder.mp4",
    localPath: "/videos/remotion/template-builder.mp4",
    title: "Report Template Builder",
    durationSec: 66,
  },
  "remotion-bulk-operations": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780546135/restoreassist/videos/remotion/bulk-operations.mp4",
    localPath: "/videos/remotion/bulk-operations.mp4",
    title: "Bulk Operations",
    durationSec: 66,
  },
  "remotion-search-filter": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780546136/restoreassist/videos/remotion/search-filter.mp4",
    localPath: "/videos/remotion/search-filter.mp4",
    title: "Advanced Search & Filter",
    durationSec: 66,
  },
  "remotion-notifications-deep-dive": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780546138/restoreassist/videos/remotion/notifications-deep-dive.mp4",
    localPath: "/videos/remotion/notifications-deep-dive.mp4",
    title: "Notification System",
    durationSec: 66,
  },
  "remotion-data-import": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780546140/restoreassist/videos/remotion/data-import.mp4",
    localPath: "/videos/remotion/data-import.mp4",
    title: "Data Import",
    durationSec: 66,
  },
  "remotion-api-webhooks": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780546141/restoreassist/videos/remotion/api-webhooks.mp4",
    localPath: "/videos/remotion/api-webhooks.mp4",
    title: "API & Webhooks",
    durationSec: 72,
  },
  "remotion-white-label": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780546143/restoreassist/videos/remotion/white-label.mp4",
    localPath: "/videos/remotion/white-label.mp4",
    title: "White Label",
    durationSec: 66,
  },
  "remotion-backup-export": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780546145/restoreassist/videos/remotion/backup-export.mp4",
    localPath: "/videos/remotion/backup-export.mp4",
    title: "Backup & Export",
    durationSec: 66,
  },
  "remotion-moisture-deep-dive": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780546147/restoreassist/videos/remotion/moisture-deep-dive.mp4",
    localPath: "/videos/remotion/moisture-deep-dive.mp4",
    title: "Moisture Mapping — Deep Dive",
    durationSec: 77,
  },
  "remotion-mobile-deep-dive": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780546148/restoreassist/videos/remotion/mobile-deep-dive.mp4",
    localPath: "/videos/remotion/mobile-deep-dive.mp4",
    title: "Mobile Workflow — Deep Dive",
    durationSec: 77,
  },

  // Tutorial Videos (2026-06-04)
  "remotion-tutorial-login": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780551944/restoreassist/videos/remotion/tutorial-login.mp4",
    localPath: "/videos/remotion/tutorial-login.mp4",
    title: "Signing in to RestoreAssist",
    durationSec: 45,
    category: "getting-started",
  },
  "remotion-tutorial-signup": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780551946/restoreassist/videos/remotion/tutorial-signup.mp4",
    localPath: "/videos/remotion/tutorial-signup.mp4",
    title: "Creating your Account",
    durationSec: 90,
    category: "getting-started",
  },
  "remotion-tutorial-setup-wizard": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780551948/restoreassist/videos/remotion/tutorial-setup-wizard.mp4",
    localPath: "/videos/remotion/tutorial-setup-wizard.mp4",
    title: "The Setup Wizard",
    durationSec: 60,
    category: "getting-started",
  },
  "remotion-tutorial-dashboard": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780551949/restoreassist/videos/remotion/tutorial-dashboard.mp4",
    localPath: "/videos/remotion/tutorial-dashboard.mp4",
    title: "Your Dashboard",
    durationSec: 40,
    category: "getting-started",
  },
  "remotion-tutorial-inspections": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780551951/restoreassist/videos/remotion/tutorial-inspections.mp4",
    localPath: "/videos/remotion/tutorial-inspections.mp4",
    title: "Inspections",
    durationSec: 50,
    category: "inspections",
  },
  "remotion-tutorial-reports": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780551953/restoreassist/videos/remotion/tutorial-reports.mp4",
    localPath: "/videos/remotion/tutorial-reports.mp4",
    title: "AI-Assisted Reports",
    durationSec: 40,
    category: "reports",
  },
  "remotion-tutorial-billing": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780551954/restoreassist/videos/remotion/tutorial-billing.mp4",
    localPath: "/videos/remotion/tutorial-billing.mp4",
    title: "Billing & Subscriptions",
    durationSec: 40,
    category: "billing",
  },
  "remotion-tutorial-team": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780551956/restoreassist/videos/remotion/tutorial-team.mp4",
    localPath: "/videos/remotion/tutorial-team.mp4",
    title: "Managing Your Team",
    durationSec: 40,
    category: "team",
  },
  "remotion-tutorial-compliance": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780551957/restoreassist/videos/remotion/tutorial-compliance.mp4",
    localPath: "/videos/remotion/tutorial-compliance.mp4",
    title: "IICRC Compliance",
    durationSec: 40,
    category: "compliance",
  },
  "remotion-tutorial-integrations": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780551959/restoreassist/videos/remotion/tutorial-integrations.mp4",
    localPath: "/videos/remotion/tutorial-integrations.mp4",
    title: "Integrations",
    durationSec: 40,
    category: "integrations",
  },

  // New-client welcome — rendered from the OnboardingWelcome Remotion
  // composition (remotion/compositions/onboarding-welcome.tsx). Produce the mp4
  // with `npm run render:tutorials`, then upload to Cloudinary (or commit to
  // public/videos/remotion/onboarding-welcome.mp4) so this entry resolves.
  "remotion-onboarding-welcome": {
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/restoreassist/videos/remotion/onboarding-welcome.mp4",
    localPath: "/videos/remotion/onboarding-welcome.mp4",
    title: "Welcome to RestoreAssist",
    durationSec: 36,
    category: "getting-started",
  },
};
