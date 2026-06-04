import { VideoExplainer } from "@/components/setup/VideoExplainer";
import { VIDEO_REGISTRY, type VideoExplainerSlug } from "@/components/setup/video-registry";

export const metadata = {
  title: "Tutorials · RestoreAssist",
  description: "Short walk-throughs of the RestoreAssist platform — sign up, setup wizard, dashboard tour, integrations, and Workspace Health.",
};

// Slugs listed in display order. Each entry is shown only if it resolves in
// VIDEO_REGISTRY — videos that haven't been produced yet are silently omitted.
const LIBRARY: { slug: string; subtitle: string }[] = [
  { slug: "setup-wizard-signup", subtitle: "Create your account and get to the wizard." },
  { slug: "setup-wizard-signin", subtitle: "Where to log back in and what's behind it." },
  { slug: "setup-wizard-setup", subtitle: "ABN → AI hydration → all-green → Activate." },
  { slug: "setup-wizard-dashboard", subtitle: "Your jobs, claims, and what to do on day one." },
  { slug: "setup-wizard-integrations", subtitle: "Connect Xero, MYOB, QuickBooks, ServiceM8, or Ascora." },
  { slug: "setup-wizard-health", subtitle: "Live status of every advertised capability." },
  // Remotion videos (production-ready)
  { slug: "remotion-hero-product-overview", subtitle: "Complete platform overview for new users." },
  { slug: "remotion-dashboard", subtitle: "Navigate the dashboard and key metrics." },
  { slug: "remotion-create-inspection", subtitle: "Start a new inspection from scratch." },
  { slug: "remotion-report-builder", subtitle: "Build professional S500-compliant reports." },
  { slug: "remotion-client-portal", subtitle: "Share reports and manage client access." },
  { slug: "remotion-evidence-capture", subtitle: "Capture and annotate photo evidence." },
  { slug: "remotion-moisture-mapping", subtitle: "Map moisture readings and dry goals." },
  { slug: "remotion-team-management", subtitle: "Invite technicians and manage licences." },
  { slug: "remotion-integration-connect", subtitle: "Connect accounting and service apps." },
  { slug: "remotion-settings-config", subtitle: "Configure your company profile and preferences." },
  { slug: "remotion-pricing-overview", subtitle: "Plans, features, and upgrade paths." },
  { slug: "remotion-analytics-overview", subtitle: "Business intelligence and reporting." },
  { slug: "remotion-compliance-checklists", subtitle: "IICRC and WHS compliance workflows." },
  { slug: "remotion-invoice-generator", subtitle: "Generate and send invoices." },
  { slug: "remotion-quote-builder", subtitle: "Build and send quotes to clients." },
  { slug: "remotion-mobile-workflow", subtitle: "Field workflow on mobile devices." },
  { slug: "remotion-inspections-list", subtitle: "Manage and filter your inspections." },
  // P1 Marketing
  { slug: "remotion-for-contractors", subtitle: "Built for restoration contractors." },
  { slug: "remotion-for-assessors", subtitle: "Built for insurance assessors." },
  { slug: "remotion-for-property-managers", subtitle: "Built for property managers." },
  { slug: "remotion-roi-explainer", subtitle: "Return on investment breakdown." },
  { slug: "remotion-evidence-chain", subtitle: "Chain of custody explained." },
  // P3 Training
  { slug: "remotion-training-s500-standard", subtitle: "IICRC S500 water categories." },
  { slug: "remotion-training-water-damage-cat", subtitle: "IICRC S500 water damage classes." },
  { slug: "remotion-training-mould-remediation", subtitle: "Mould remediation protocol." },
  { slug: "remotion-training-fire-smoke", subtitle: "Fire and smoke damage types." },
  // P2 Deep Dives
  { slug: "remotion-evidence-chain-deep-dive", subtitle: "Deep dive into chain of custody." },
  { slug: "remotion-photo-annotation-deep-dive", subtitle: "Photo annotation toolkit." },
  { slug: "remotion-template-builder", subtitle: "Report template builder." },
  { slug: "remotion-bulk-operations", subtitle: "Bulk operations and performance." },
  { slug: "remotion-search-filter", subtitle: "Advanced search and filter." },
  { slug: "remotion-notifications-deep-dive", subtitle: "Notification system deep dive." },
  { slug: "remotion-data-import", subtitle: "Data import from external sources." },
  { slug: "remotion-api-webhooks", subtitle: "API and webhooks for developers." },
  { slug: "remotion-white-label", subtitle: "White label and brand customisation." },
  { slug: "remotion-backup-export", subtitle: "Backup and export your data." },
  { slug: "remotion-moisture-deep-dive", subtitle: "Moisture mapping deep dive." },
  { slug: "remotion-mobile-deep-dive", subtitle: "Mobile workflow deep dive." },
];

interface LearnPageProps {
  searchParams: Promise<{ video?: string }>;
}

export default async function LearnPage({ searchParams }: LearnPageProps) {
  const { video: highlightedSlug } = await searchParams;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Tutorials</h1>
        <p className="mt-2 text-muted-foreground">
          Short walk-throughs of the RestoreAssist platform — 30 seconds to 2 minutes each.
        </p>
      </header>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {LIBRARY.map(({ slug, subtitle }) => {
          const entry = VIDEO_REGISTRY[slug as VideoExplainerSlug];
          if (!entry) return null;
          const isHighlighted = slug === highlightedSlug;
          return (
            <article
              key={slug}
              id={slug}
              className={`space-y-3 rounded-xl p-3 transition-colors ${
                isHighlighted ? "bg-[#8A6B4E]/10 border-2 border-[#8A6B4E]" : ""
              }`}
            >
              <VideoExplainer slug={slug as VideoExplainerSlug} />
              <div>
                <h2 className="text-base font-semibold">{entry.title}</h2>
                <p className="text-sm text-muted-foreground">{subtitle}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {`${Math.floor(entry.durationSec / 60)}:${String(entry.durationSec % 60).padStart(2, "0")}`}
                </p>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
