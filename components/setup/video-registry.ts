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
 *   - Cloudinary-hosted (set `cloudinaryUrl`) — CDN delivery for app-embedded
 *     playback. Preferred for onboarding flows that need offline support.
 */

export type VideoExplainerSlug =
  // Setup / Onboarding (YouTube)
  | "setup-wizard-signin"
  | "setup-wizard-signup"
  | "setup-wizard-setup"
  | "setup-wizard-dashboard"
  | "setup-wizard-integrations"
  | "setup-wizard-health"
  // Branded tutorial videos (generated MP4s in /public/videos/tutorials/)
  | "tutorial-login"
  | "tutorial-signup"
  | "tutorial-setup-wizard"
  | "tutorial-dashboard"
  | "tutorial-inspections"
  | "tutorial-reports"
  | "tutorial-billing"
  | "tutorial-team"
  | "tutorial-compliance"
  // Help videos (existing MP4s in /public/videos/help/)
  | "help-inspections"
  | "help-reports"
  | "help-clients-and-portal"
  | "help-billing"
  | "help-team"
  | "help-compliance";

export interface RegistryEntry {
  youtubeId?: string;
  /**
   * Cloudinary-hosted video URL (for app-embedded, offline-capable playback).
   * Set EITHER this OR `youtubeId` OR `localPath`.
   */
  cloudinaryUrl?: string;
  /**
   * Path beneath `/public` (with leading slash) to a repo-hosted MP4.
   * Set EITHER this OR `youtubeId` OR `cloudinaryUrl`, not both.
   */
  localPath?: string;
  title: string;
  durationSec: number;
}

export const VIDEO_REGISTRY: Record<VideoExplainerSlug, RegistryEntry> = {
  // ── Setup / Onboarding (YouTube) ──────────────────────────────────────
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

  // ── Branded Tutorial Videos (generated MP4s) ──────────────────────────
  "tutorial-login": {
    localPath: "/videos/tutorials/restoreassist-login-v1.mp4",
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780231475/--all/tutorials/tutorial-login.mp4",
    title: "Signing in to RestoreAssist",
    durationSec: 30,
  },
  "tutorial-signup": {
    localPath: "/videos/tutorials/restoreassist-signup-v1.mp4",
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780231477/--all/tutorials/tutorial-signup.mp4",
    title: "Creating Your RestoreAssist Account",
    durationSec: 38,
  },
  "tutorial-setup-wizard": {
    localPath: "/videos/tutorials/restoreassist-setup-wizard-v1.mp4",
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780231500/--all/tutorials/tutorial-setup-wizard.mp4",
    title: "The RestoreAssist Setup Wizard",
    durationSec: 39,
  },
  "tutorial-dashboard": {
    localPath: "/videos/tutorials/restoreassist-dashboard-v1.mp4",
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780231501/--all/tutorials/tutorial-dashboard.mp4",
    title: "Your RestoreAssist Dashboard",
    durationSec: 29,
  },
  "tutorial-inspections": {
    localPath: "/videos/tutorials/restoreassist-inspections-v1.mp4",
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780231503/--all/tutorials/tutorial-inspections.mp4",
    title: "Inspections with RestoreAssist",
    durationSec: 31,
  },
  "tutorial-reports": {
    localPath: "/videos/tutorials/restoreassist-reports-v1.mp4",
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780231504/--all/tutorials/tutorial-reports.mp4",
    title: "AI-Assisted Reports",
    durationSec: 31,
  },
  "tutorial-billing": {
    localPath: "/videos/tutorials/restoreassist-billing-v1.mp4",
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780231506/--all/tutorials/tutorial-billing.mp4",
    title: "Billing & Subscriptions",
    durationSec: 29,
  },
  "tutorial-team": {
    localPath: "/videos/tutorials/restoreassist-team-v1.mp4",
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780231507/--all/tutorials/tutorial-team.mp4",
    title: "Managing Your Team",
    durationSec: 29,
  },
  "tutorial-compliance": {
    localPath: "/videos/tutorials/restoreassist-compliance-v1.mp4",
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780231509/--all/tutorials/tutorial-compliance.mp4",
    title: "IICRC Compliance",
    durationSec: 30,
  },

  // ── Help Videos (existing MP4s) ───────────────────────────────────────
  "help-inspections": {
    localPath: "/videos/help/help-inspections.mp4",
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780231517/--all/help/help-inspections.mp4",
    title: "Inspections — chain-of-custody capture",
    durationSec: 75,
  },
  "help-reports": {
    localPath: "/videos/help/help-reports.mp4",
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780231536/--all/help/help-reports.mp4",
    title: "AI-drafted S500 reports — review and sign off",
    durationSec: 75,
  },
  "help-clients-and-portal": {
    localPath: "/videos/help/help-clients-and-portal.mp4",
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780231539/--all/help/help-clients-and-portal.mp4",
    title: "Share reports via the client portal",
    durationSec: 75,
  },
  "help-billing": {
    localPath: "/videos/help/help-billing.mp4",
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780231544/--all/help/help-billing.mp4",
    title: "Trial, paid tiers, and Stripe Checkout",
    durationSec: 75,
  },
  "help-team": {
    localPath: "/videos/help/help-team.mp4",
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780231547/--all/help/help-team.mp4",
    title: "Invite a technician + verify their licence",
    durationSec: 75,
  },
  "help-compliance": {
    localPath: "/videos/help/help-compliance.mp4",
    cloudinaryUrl: "https://res.cloudinary.com/dmaulkthb/video/upload/v1780231552/--all/help/help-compliance.mp4",
    title: "IICRC citation format and edition discipline",
    durationSec: 75,
  },
};
