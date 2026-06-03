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
  | "remotion-pricing-overview";

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
}

export const VIDEO_REGISTRY: Record<VideoExplainerSlug, RegistryEntry> = {
  "setup-wizard-signin": {
    youtubeId: "tsmZpgLrn5Y",
    title: "Signing in to RestoreAssist",
    durationSec: 30,
  },
  "setup-wizard-signup": {
    youtubeId: "wREGInp5yPQ",
    title: "Creating your RestoreAssist account",
    durationSec: 60,
  },
  "setup-wizard-setup": {
    youtubeId: "G2CIyp-gDKA",
    title: "The RestoreAssist Setup Wizard — end-to-end",
    durationSec: 120,
  },
  "setup-wizard-dashboard": {
    youtubeId: "sp3bMYSaZa8",
    title: "Your RestoreAssist dashboard, post-activation",
    durationSec: 120,
  },
  "setup-wizard-integrations": {
    youtubeId: "P6rVHLOVNsQ",
    title: "Connect Xero, MYOB, QuickBooks, ServiceM8 or Ascora",
    durationSec: 90,
  },
  "setup-wizard-health": {
    youtubeId: "UHUiqnhxGtw",
    title: "Your RestoreAssist Workspace Health page",
    durationSec: 60,
  },
  "help-inspections": {
    localPath: "/videos/help/help-inspections.mp4",
    title: "Inspections — chain-of-custody capture",
    durationSec: 75,
  },
  "help-reports": {
    localPath: "/videos/help/help-reports.mp4",
    title: "AI-drafted S500 reports — review and sign off",
    durationSec: 75,
  },
  "help-clients-and-portal": {
    localPath: "/videos/help/help-clients-and-portal.mp4",
    title: "Share reports via the client portal",
    durationSec: 75,
  },
  "help-billing": {
    localPath: "/videos/help/help-billing.mp4",
    title: "Trial, paid tiers, and Stripe Checkout",
    durationSec: 75,
  },
  "help-team": {
    localPath: "/videos/help/help-team.mp4",
    title: "Invite a technician + verify their licence",
    durationSec: 75,
  },
  "help-compliance": {
    localPath: "/videos/help/help-compliance.mp4",
    title: "IICRC citation format and edition discipline",
    durationSec: 75,
  },

  // ── Remotion rendered videos (brand-correct, audio, production-ready) ──
  "remotion-sign-in": {
    localPath: "/videos/remotion/sign-in.mp4",
    title: "Signing in to RestoreAssist",
    durationSec: 45,
  },
  "remotion-sign-up": {
    localPath: "/videos/remotion/sign-up.mp4",
    title: "Creating your RestoreAssist account",
    durationSec: 60,
  },
  "remotion-dashboard": {
    localPath: "/videos/remotion/dashboard-walkthrough.mp4",
    title: "Your RestoreAssist dashboard",
    durationSec: 32,
  },
  "remotion-create-inspection": {
    localPath: "/videos/remotion/create-inspection.mp4",
    title: "Creating a new inspection",
    durationSec: 42,
  },
  "remotion-report-builder": {
    localPath: "/videos/remotion/report-builder.mp4",
    title: "Building professional reports",
    durationSec: 36,
  },
  "remotion-client-portal": {
    localPath: "/videos/remotion/client-portal.mp4",
    title: "Sharing reports via the client portal",
    durationSec: 32,
  },
  "remotion-why-restoreassist": {
    localPath: "/videos/remotion/why-restoreassist.mp4",
    title: "Why restoration teams choose RestoreAssist",
    durationSec: 36,
  },
  "remotion-byok": {
    localPath: "/videos/remotion/byok-explainer.mp4",
    title: "Bring Your Own Knowledge and Equipment",
    durationSec: 42,
  },
  "remotion-inspections-list": {
    localPath: "/videos/remotion/inspections-list.mp4",
    title: "Managing your inspections list",
    durationSec: 34,
  },
  "remotion-evidence-capture": {
    localPath: "/videos/remotion/evidence-capture.mp4",
    title: "Capturing court-admissible evidence",
    durationSec: 32,
  },
  "remotion-moisture-mapping": {
    localPath: "/videos/remotion/moisture-mapping.mp4",
    title: "Moisture mapping and dry goals",
    durationSec: 30,
  },
  "remotion-quote-builder": {
    localPath: "/videos/remotion/quote-builder.mp4",
    title: "Building professional quotes",
    durationSec: 32,
  },
  "remotion-invoice-generator": {
    localPath: "/videos/remotion/invoice-generator.mp4",
    title: "Generating GST-compliant invoices",
    durationSec: 28,
  },
  "remotion-compliance-checklists": {
    localPath: "/videos/remotion/compliance-checklists.mp4",
    title: "IICRC S500 compliance checklists",
    durationSec: 32,
  },
  "remotion-analytics-overview": {
    localPath: "/videos/remotion/analytics-overview.mp4",
    title: "Business analytics overview",
    durationSec: 45,
  },
  "remotion-team-management": {
    localPath: "/videos/remotion/team-management.mp4",
    title: "Managing your restoration crew",
    durationSec: 50,
  },
  "remotion-mobile-workflow": {
    localPath: "/videos/remotion/mobile-workflow.mp4",
    title: "Mobile workflow for field teams",
    durationSec: 30,
  },
  "remotion-pricing-overview": {
    localPath: "/videos/remotion/pricing-overview.mp4",
    title: "RestoreAssist pricing and plans",
    durationSec: 60,
  },
};
