/**
 * Slug-addressable registry of RestoreAssist tutorial videos.
 *
 * Lives in its own (non-"use client") file so both server components
 * (e.g. /app/dashboard/learn/page.tsx) and the client `<VideoExplainer>`
 * can import it. Putting these constants inside the "use client" file
 * makes them invisible to server components — Next.js's RSC bundler
 * elides the initializer for the server-side bundle.
 */

export type VideoExplainerSlug =
  | "setup-wizard-signin"
  | "setup-wizard-signup"
  | "setup-wizard-setup"
  | "setup-wizard-dashboard"
  | "setup-wizard-integrations"
  | "setup-wizard-health";

export interface RegistryEntry {
  youtubeId: string;
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
};
