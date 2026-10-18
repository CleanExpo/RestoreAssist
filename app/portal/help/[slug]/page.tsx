import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CLIENT_HELP_ARTICLES,
  getClientHelpArticle,
  videosForArticle,
} from "@/lib/portal/client-help";
import { PORTAL_PATHS } from "@/lib/portal/recovery-paths";
import { PortalHelpMedia } from "@/components/portal/PortalHelpMedia";
import { ClientPortalShell } from "@/components/portal/ClientPortalShell";
import { clientPortalPanelPadding } from "@/lib/portal/client-portal-theme";

export function generateStaticParams() {
  return CLIENT_HELP_ARTICLES.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getClientHelpArticle(slug);
  if (!article) return { title: "Client portal help" };
  return {
    title: `${article.title} · Client portal help`,
    description: article.summary,
  };
}

export default async function PortalHelpArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getClientHelpArticle(slug);
  if (!article) notFound();

  const videos = videosForArticle(article);

  return (
    <ClientPortalShell>
      <article className="mx-auto max-w-3xl space-y-8 py-2">
        <nav className="text-sm text-slate-400">
          <Link
            href={PORTAL_PATHS.help}
            className="text-cyan-400/90 hover:underline"
          >
            Client help
          </Link>
          <span className="px-2">/</span>
          <span className="text-slate-300">{article.title}</span>
        </nav>

        <header>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            {article.title}
          </h1>
          <p className="mt-2 text-slate-400">{article.summary}</p>
        </header>

        {article.sections.map((section) => (
          <section key={section.heading} className={clientPortalPanelPadding}>
            <h2 className="text-lg font-semibold text-white/90">
              {section.heading}
            </h2>
            <p className="mt-2 leading-relaxed text-slate-400">{section.body}</p>
          </section>
        ))}

        <PortalHelpMedia videos={videos} />

        <p className="text-sm text-slate-400">
          <Link
            href={PORTAL_PATHS.recovery}
            className="text-cyan-400/90 hover:underline"
          >
            Request a new invite
          </Link>
          <span className="px-2 text-slate-600">·</span>
          <Link
            href={PORTAL_PATHS.login}
            className="text-cyan-400/90 hover:underline"
          >
            Client portal sign-in
          </Link>
        </p>
      </article>
    </ClientPortalShell>
  );
}
