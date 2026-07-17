"use client";

import { useState, useEffect, useMemo } from "react";
import { VideoExplainer } from "@/components/setup/VideoExplainer";
import { VIDEO_REGISTRY, type VideoExplainerSlug } from "@/components/setup/video-registry";
import { Input } from "@/components/ui/input";

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "getting-started", label: "Getting Started" },
  { key: "inspections", label: "Inspections" },
  { key: "reports", label: "Reports" },
  { key: "billing", label: "Billing" },
  { key: "team", label: "Team" },
  { key: "integrations", label: "Integrations" },
  { key: "compliance", label: "Compliance" },
  { key: "marketing", label: "Marketing" },
  { key: "training", label: "Training" },
] as const;

const LIBRARY: { slug: string; subtitle: string; category: string }[] = [
  { slug: "setup-wizard-signup", subtitle: "Create your account and get to the wizard.", category: "getting-started" },
  { slug: "setup-wizard-signin", subtitle: "Where to log back in and what's behind it.", category: "getting-started" },
  { slug: "setup-wizard-setup", subtitle: "ABN → AI hydration → all-green → Activate.", category: "getting-started" },
  { slug: "setup-wizard-dashboard", subtitle: "Your jobs, claims, and what to do on day one.", category: "getting-started" },
  { slug: "setup-wizard-integrations", subtitle: "Connect Xero, MYOB, QuickBooks, ServiceM8, or Ascora.", category: "integrations" },
  { slug: "setup-wizard-health", subtitle: "Live status of every advertised capability.", category: "getting-started" },
  { slug: "remotion-tutorial-login", subtitle: "How to sign in to your account.", category: "getting-started" },
  { slug: "remotion-tutorial-signup", subtitle: "Create your account from scratch.", category: "getting-started" },
  { slug: "remotion-tutorial-setup-wizard", subtitle: "The 5-step setup wizard walkthrough.", category: "getting-started" },
  { slug: "remotion-tutorial-dashboard", subtitle: "Navigate your dashboard and key metrics.", category: "getting-started" },
  { slug: "remotion-tutorial-inspections", subtitle: "Create, capture, and submit inspections.", category: "inspections" },
  { slug: "remotion-tutorial-reports", subtitle: "Generate AI-assisted professional reports.", category: "reports" },
  { slug: "remotion-tutorial-billing", subtitle: "Plans, invoices, and upgrades.", category: "billing" },
  { slug: "remotion-tutorial-team", subtitle: "Invite members and manage roles.", category: "team" },
  { slug: "remotion-tutorial-compliance", subtitle: "IICRC standards and digital compliance.", category: "compliance" },
  { slug: "remotion-tutorial-integrations", subtitle: "Connect Xero, MYOB, QuickBooks, and more.", category: "integrations" },
  { slug: "remotion-hero-product-overview", subtitle: "Complete platform overview for new users.", category: "getting-started" },
  { slug: "remotion-dashboard", subtitle: "Navigate the dashboard and key metrics.", category: "getting-started" },
  { slug: "remotion-create-inspection", subtitle: "Start a new inspection from scratch.", category: "inspections" },
  { slug: "remotion-report-builder", subtitle: "Build professional S500-compliant reports.", category: "reports" },
  { slug: "remotion-client-portal", subtitle: "Share reports and manage client access.", category: "marketing" },
  { slug: "remotion-evidence-capture", subtitle: "Capture and annotate photo evidence.", category: "inspections" },
  { slug: "remotion-moisture-mapping", subtitle: "Map moisture readings and dry goals.", category: "inspections" },
  { slug: "remotion-team-management", subtitle: "Invite technicians and manage licences.", category: "team" },
  { slug: "remotion-integration-connect", subtitle: "Connect accounting and service apps.", category: "integrations" },
  { slug: "remotion-settings-config", subtitle: "Configure your company profile and preferences.", category: "getting-started" },
  { slug: "remotion-pricing-overview", subtitle: "Plans, features, and upgrade paths.", category: "billing" },
  { slug: "remotion-analytics-overview", subtitle: "Business intelligence and reporting.", category: "reports" },
  { slug: "remotion-compliance-checklists", subtitle: "IICRC and WHS compliance workflows.", category: "compliance" },
  { slug: "remotion-invoice-generator", subtitle: "Generate and send invoices.", category: "billing" },
  { slug: "remotion-quote-builder", subtitle: "Build and send quotes to clients.", category: "billing" },
  { slug: "remotion-mobile-workflow", subtitle: "Field workflow on mobile devices.", category: "inspections" },
  { slug: "remotion-inspections-list", subtitle: "Manage and filter your inspections.", category: "inspections" },
  { slug: "remotion-for-contractors", subtitle: "Built for restoration contractors.", category: "marketing" },
  { slug: "remotion-for-assessors", subtitle: "Built for insurance assessors.", category: "marketing" },
  { slug: "remotion-for-property-managers", subtitle: "Built for property managers.", category: "marketing" },
  { slug: "remotion-roi-explainer", subtitle: "Return on investment breakdown.", category: "marketing" },
  { slug: "remotion-evidence-chain", subtitle: "Chain of custody explained.", category: "compliance" },
  { slug: "remotion-training-s500-standard", subtitle: "IICRC S500 water categories.", category: "training" },
  { slug: "remotion-training-water-damage-cat", subtitle: "IICRC S500 water damage classes.", category: "training" },
  { slug: "remotion-training-mould-remediation", subtitle: "Mould remediation protocol.", category: "training" },
  { slug: "remotion-training-fire-smoke", subtitle: "Fire and smoke damage types.", category: "training" },
  { slug: "remotion-evidence-chain-deep-dive", subtitle: "Deep dive into chain of custody.", category: "compliance" },
  { slug: "remotion-photo-annotation-deep-dive", subtitle: "Photo annotation toolkit.", category: "inspections" },
  { slug: "remotion-template-builder", subtitle: "Report template builder.", category: "reports" },
  { slug: "remotion-bulk-operations", subtitle: "Bulk operations and performance.", category: "team" },
  { slug: "remotion-search-filter", subtitle: "Advanced search and filter.", category: "team" },
  { slug: "remotion-notifications-deep-dive", subtitle: "Notification system deep dive.", category: "team" },
  { slug: "remotion-data-import", subtitle: "Data import from external sources.", category: "integrations" },
  { slug: "remotion-api-webhooks", subtitle: "API and webhooks for developers.", category: "integrations" },
  { slug: "remotion-white-label", subtitle: "White label and brand customisation.", category: "marketing" },
  { slug: "remotion-backup-export", subtitle: "Backup and export your data.", category: "compliance" },
  { slug: "remotion-moisture-deep-dive", subtitle: "Moisture mapping deep dive.", category: "inspections" },
  { slug: "remotion-mobile-deep-dive", subtitle: "Mobile workflow deep dive.", category: "inspections" },
];

const STORAGE_KEY = "ra-video-progress";

interface ProgressMap {
  [slug: string]: { watched: boolean; percent?: number };
}

function getProgress(): ProgressMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function setProgress(slug: string, data: { watched: boolean; percent?: number }) {
  const current = getProgress();
  current[slug] = { ...current[slug], ...data };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
}

export function LearnPageClient() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [progress, setProgressState] = useState<ProgressMap>({});

  useEffect(() => {
    setProgressState(getProgress());
  }, []);

  const filtered = useMemo(() => {
    return LIBRARY.filter(({ slug, subtitle, category }) => {
      const entry = VIDEO_REGISTRY[slug as VideoExplainerSlug];
      if (!entry) return false;
      const matchesSearch =
        search === "" ||
        entry.title.toLowerCase().includes(search.toLowerCase()) ||
        subtitle.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = activeCategory === "all" || category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [search, activeCategory]);

  const totalWatched = useMemo(() => {
    return Object.values(progress).filter((p) => p.watched).length;
  }, [progress]);

  const handleVideoPlay = (slug: string) => {
    setProgress(slug, { watched: true });
    setProgressState(getProgress());
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Tutorials</h1>
        <p className="mt-2 text-muted-foreground">
          Short walk-throughs of the RestoreAssist platform — {filtered.length} videos available.
        </p>
      </header>

      <div className="mb-6 rounded-lg bg-brand-navy/5 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">
            {totalWatched} of {LIBRARY.length} watched
          </span>
          <span className="text-sm text-muted-foreground">
            {Math.round((totalWatched / LIBRARY.length) * 100)}% complete
          </span>
        </div>
        <div className="h-2 rounded-full bg-brand-navy/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-brand-bronze transition-all duration-500"
            style={{ width: `${(totalWatched / LIBRARY.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="relative mb-4">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true">⌕</span>
        <Input
          placeholder="Search tutorials..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {CATEGORIES.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveCategory(key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeCategory === key
                ? "bg-brand-navy text-white"
                : "bg-brand-navy/5 text-brand-navy hover:bg-brand-navy/10"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map(({ slug, subtitle }) => {
          const entry = VIDEO_REGISTRY[slug as VideoExplainerSlug];
          const isWatched = progress[slug]?.watched;
          return (
            <article
              key={slug}
              id={slug}
              className="space-y-3 rounded-xl p-3 transition-colors hover:bg-brand-bronze/5"
            >
              <div onClick={() => handleVideoPlay(slug)} className="cursor-pointer">
                <VideoExplainer slug={slug as VideoExplainerSlug} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold">{entry.title}</h2>
                  {isWatched ? (
                    <span className="h-4 w-4 text-success" aria-hidden="true">●</span>
                  ) : (
                    <span className="h-4 w-4 text-brand-bronze" aria-hidden="true">▶</span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{subtitle}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {`${Math.floor(entry.durationSec / 60)}:${String(entry.durationSec % 60).padStart(2, "0")}`}
                  {isWatched && " · Watched"}
                </p>
              </div>
            </article>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No tutorials match your search.
        </div>
      )}
    </div>
  );
}
