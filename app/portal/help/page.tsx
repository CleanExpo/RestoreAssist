import Link from "next/link";
import { CLIENT_HELP_ARTICLES, CLIENT_HELP_INDEX_INTRO } from "@/lib/portal/client-help";
import { PORTAL_PATHS } from "@/lib/portal/recovery-paths";
import { CLIENT_PORTAL_VIDEOS } from "@/lib/portal/client-videos";
import { PortalHelpMedia } from "@/components/portal/PortalHelpMedia";
import { PortalAccessExplainer } from "@/components/portal/PortalAccessExplainer";

export const metadata = {
  title: "Client portal help",
  description:
    "Help for job links, portal accounts, reports, approvals, invoices, and support.",
};

export default function PortalHelpIndexPage() {
  return (
    <main className="min-h-screen bg-brand-cloud">
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
        <header>
          <p className="text-sm text-brand-slate mb-2">
            <Link href={PORTAL_PATHS.login} className="text-brand-cta hover:underline">
              Client portal sign-in
            </Link>
            <span className="px-2 text-brand-slate/50">·</span>
            <Link
              href={PORTAL_PATHS.recovery}
              className="text-brand-cta hover:underline"
            >
              Recover access
            </Link>
          </p>
          <h1 className="text-3xl font-bold text-brand-navy">Client portal help</h1>
          <p className="mt-2 text-brand-slate">{CLIENT_HELP_INDEX_INTRO}</p>
        </header>

        <PortalAccessExplainer />

        <ul className="space-y-3">
          {CLIENT_HELP_ARTICLES.map((article) => (
            <li key={article.slug}>
              <Link
                href={`${PORTAL_PATHS.help}/${article.slug}`}
                className="block bg-white rounded-lg border border-brand-slate/20 p-5 hover:border-brand-bronze/40"
              >
                <h2 className="text-lg font-semibold text-brand-navy">
                  {article.title}
                </h2>
                <p className="mt-1 text-sm text-brand-slate">{article.summary}</p>
              </Link>
            </li>
          ))}
        </ul>

        <PortalHelpMedia
          videos={CLIENT_PORTAL_VIDEOS}
          heading="What to expect during restoration"
        />
      </div>
    </main>
  );
}
