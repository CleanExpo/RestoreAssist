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
};
