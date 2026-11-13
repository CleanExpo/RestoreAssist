import Link from "next/link";
import { CLIENT_HELP_ARTICLES, CLIENT_HELP_INDEX_INTRO } from "@/lib/portal/client-help";
import { PORTAL_PATHS } from "@/lib/portal/recovery-paths";
import { CLIENT_PORTAL_VIDEOS } from "@/lib/portal/client-videos";
import { PortalHelpMedia } from "@/components/portal/PortalHelpMedia";
import { PortalAccessExplainer } from "@/components/portal/PortalAccessExplainer";
import { PortalHelpPageShell } from "@/components/portal/PortalHelpPageShell";
import { clientPortalPanelPadding } from "@/lib/portal/client-portal-theme";

export const metadata = {
  title: "Client portal help",
  description:
    "Help for job links, portal accounts, reports, approvals, invoices, and support.",
};

export default function PortalHelpIndexPage() {
  return (
    <PortalHelpPageShell title="Client portal help" intro={CLIENT_HELP_INDEX_INTRO}>
      <PortalAccessExplainer />

      <ul className="space-y-3">
        {CLIENT_HELP_ARTICLES.map((article) => (
          <li key={article.slug}>
            <Link
              href={`${PORTAL_PATHS.help}/${article.slug}`}
              className={`${clientPortalPanelPadding} block transition hover:border-cyan-400/30`}
            >
              <h2 className="text-lg font-semibold text-white/95">
                {article.title}
              </h2>
              <p className="mt-1 text-sm text-slate-400">{article.summary}</p>
            </Link>
          </li>
        ))}
      </ul>

      <PortalHelpMedia
        videos={CLIENT_PORTAL_VIDEOS}
        heading="What to expect during restoration"
      />
    </PortalHelpPageShell>
  );
}
