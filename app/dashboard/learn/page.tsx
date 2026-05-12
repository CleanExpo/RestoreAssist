import { VideoExplainer, VIDEO_REGISTRY, type VideoExplainerSlug } from "@/components/setup/VideoExplainer";

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
];

export default function LearnPage() {
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
          return (
            <article key={slug} className="space-y-3">
              <VideoExplainer slug={slug as VideoExplainerSlug} />
              <div>
                <h2 className="text-base font-semibold">{entry.title}</h2>
                <p className="text-sm text-muted-foreground">{subtitle}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {`0:${String(entry.durationSec).padStart(2, "0")}`}
                </p>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
