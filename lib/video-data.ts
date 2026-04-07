/**
 * RestoreAssist how-to video series data.
 *
 * youtubeId is populated after running the video pipeline:
 *   cd packages/videos && pnpm render && pnpm upload && pnpm embed
 *
 * Empty string = video not yet uploaded ("Coming Soon" on the help page).
 *
 * The embed-videos script can also update public/video-embeds.json which the
 * help page fetches at runtime to get the latest YouTube IDs without a redeploy.
 */

export interface VideoEntry {
  slug: string;
  episode: number;
  title: string;
  description: string;
  /** YouTube video ID — empty until uploaded */
  youtubeId: string;
}

export interface VideoSeries {
  name: string;
  description: string;
  /** YouTube playlist ID — empty until created by upload script */
  playlistId: string;
  videos: VideoEntry[];
}

export const VIDEO_SERIES: VideoSeries[] = [
  {
    name: "Getting Started",
    description: "Set up your account and create your first inspection.",
    playlistId: "",
    videos: [
      {
        episode: 1,
        slug: "welcome",
        title: "Welcome to RestoreAssist",
        description:
          "Get started with RestoreAssist, the Australian water damage restoration platform built for IICRC S500:2025 compliance.",
        youtubeId: "",
      },
      {
        episode: 2,
        slug: "account-setup",
        title: "Account Setup & Team Configuration",
        description:
          "Configure your company profile, add team members, and set up your RestoreAssist account.",
        youtubeId: "",
      },
      {
        episode: 3,
        slug: "byok-setup",
        title: "BYOK AI Setup",
        description:
          "Connect your own Claude or Gemini API key to power AI-generated scope narratives.",
        youtubeId: "",
      },
      {
        episode: 4,
        slug: "create-inspection",
        title: "Create Your First Inspection",
        description:
          "Walk through creating a new water damage inspection from address entry to first readings.",
        youtubeId: "",
      },
    ],
  },
  {
    name: "Field Operations",
    description: "Document moisture readings, photos, and equipment on site.",
    playlistId: "",
    videos: [
      {
        episode: 5,
        slug: "moisture-readings",
        title: "Moisture Readings & Drying Data",
        description:
          "Record and track moisture readings across multiple drying days.",
        youtubeId: "",
      },
      {
        episode: 6,
        slug: "mobile-overview",
        title: "Mobile App Overview",
        description:
          "Use RestoreAssist on iOS and Android for on-site documentation.",
        youtubeId: "",
      },
      {
        episode: 7,
        slug: "offline-mode",
        title: "Offline Mode",
        description:
          "Keep working in basements and remote locations with full offline support.",
        youtubeId: "",
      },
      {
        episode: 8,
        slug: "environmental-monitoring",
        title: "Environmental Monitoring",
        description:
          "Track ambient temperature, humidity, and GPP readings per drying day.",
        youtubeId: "",
      },
      {
        episode: 9,
        slug: "photo-documentation",
        title: "Photo Documentation",
        description:
          "Attach geotagged, timestamped photos to every inspection step.",
        youtubeId: "",
      },
      {
        episode: 10,
        slug: "equipment-tracking",
        title: "Equipment Tracking",
        description:
          "Track equipment placement, serial numbers, and IICRC S500 ratios.",
        youtubeId: "",
      },
    ],
  },
  {
    name: "Compliance & Reporting",
    description: "Generate IICRC-compliant reports and satisfy insurers.",
    playlistId: "",
    videos: [
      {
        episode: 11,
        slug: "water-damage-classification",
        title: "Water Damage Classification",
        description:
          "Let RestoreAssist auto-classify damage category and class per IICRC S500.",
        youtubeId: "",
      },
      {
        episode: 12,
        slug: "generate-report",
        title: "Generate IICRC Reports in One Click",
        description:
          "Produce a full PDF report with IICRC S500 citations in seconds.",
        youtubeId: "",
      },
      {
        episode: 13,
        slug: "dashboard-kpis",
        title: "Dashboard KPIs",
        description:
          "Monitor active jobs, revenue, and compliance rates from your dashboard.",
        youtubeId: "",
      },
      {
        episode: 14,
        slug: "search-and-filter",
        title: "Search & Filter Inspections",
        description:
          "Use powerful search and filters to find any job by date, status, or address.",
        youtubeId: "",
      },
      {
        episode: 15,
        slug: "iicrc-s500-compliance",
        title: "IICRC S500:2025 Compliance",
        description:
          "Understand how RestoreAssist enforces IICRC S500:2025 compliance at every step.",
        youtubeId: "",
      },
      {
        episode: 16,
        slug: "e-signature",
        title: "Electronic Signatures",
        description:
          "Collect legally binding e-signatures from technicians and property owners.",
        youtubeId: "",
      },
    ],
  },
  {
    name: "Advanced Features",
    description: "Sync, scan, calibrate, and manage your team.",
    playlistId: "",
    videos: [
      {
        episode: 17,
        slug: "sync-engine",
        title: "Real-Time Sync",
        description:
          "Understand how RestoreAssist syncs data across devices in real time.",
        youtubeId: "",
      },
      {
        episode: 18,
        slug: "barcode-scanner",
        title: "Barcode Scanner",
        description:
          "Scan equipment barcodes to assign and track gear without manual entry.",
        youtubeId: "",
      },
      {
        episode: 19,
        slug: "calibration-tracking",
        title: "Calibration Tracking",
        description:
          "Set calibration reminders and track compliance for all measuring equipment.",
        youtubeId: "",
      },
      {
        episode: 20,
        slug: "affected-areas",
        title: "Affected Areas",
        description:
          "Map affected rooms, materials, and moisture readings room by room.",
        youtubeId: "",
      },
      {
        episode: 21,
        slug: "drying-progress",
        title: "Drying Progress Charts",
        description:
          "Visualise drying progress and prove drying goal achievement to insurers.",
        youtubeId: "",
      },
      {
        episode: 22,
        slug: "team-management",
        title: "Team Management",
        description:
          "Add team members, assign roles, and control access per inspection.",
        youtubeId: "",
      },
    ],
  },
  {
    name: "Integrations & AI",
    description: "Connect Ascora, use AI, and access training resources.",
    playlistId: "",
    videos: [
      {
        episode: 23,
        slug: "billing-subscription",
        title: "Billing & Subscription",
        description:
          "Manage your subscription, upgrade plans, and view billing history.",
        youtubeId: "",
      },
      {
        episode: 24,
        slug: "ascora-sync",
        title: "Ascora Integration",
        description:
          "Connect your Ascora CRM to sync jobs and pricing data automatically.",
        youtubeId: "",
      },
      {
        episode: 25,
        slug: "ai-report-generation",
        title: "AI Report Generation",
        description:
          "See how the AI scope narrative generator produces IICRC-cited scope documents.",
        youtubeId: "",
      },
      {
        episode: 26,
        slug: "ai-classification",
        title: "AI Auto-Classification",
        description:
          "Use AI to instantly classify water damage from photos and readings.",
        youtubeId: "",
      },
      {
        episode: 27,
        slug: "resources-library",
        title: "Resources Library",
        description:
          "Access IICRC standards, compliance guides, and training materials.",
        youtubeId: "",
      },
      {
        episode: 28,
        slug: "getting-help",
        title: "Getting Help",
        description:
          "Find help via email, live chat, and the RestoreAssist documentation.",
        youtubeId: "",
      },
    ],
  },
];

export const totalVideos = VIDEO_SERIES.reduce(
  (acc, s) => acc + s.videos.length,
  0,
);
