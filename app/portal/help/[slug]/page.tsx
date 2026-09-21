import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CLIENT_HELP_ARTICLES,
  getClientHelpArticle,
  videosForArticle,
} from "@/lib/portal/client-help";
import { PORTAL_PATHS } from "@/lib/portal/recovery-paths";
import { PortalHelpMedia } from "@/components/portal/PortalHelpMedia";

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
    <main className="min-h-screen bg-brand-cloud">
      <article className="max-w-3xl mx-auto px-4 py-10 space-y-8">
        <nav className="text-sm text-brand-slate">
          <Link href={PORTAL_PATHS.help} className="text-brand-cta hover:underline">
            Client help
          </Link>
          <span className="px-2">/</span>
          <span>{article.title}</span>
        </nav>

        <header>
          <h1 className="text-3xl font-bold text-brand-navy">{article.title}</h1>
          <p className="mt-2 text-brand-slate">{article.summary}</p>
        </header>

        {article.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-lg font-semibold text-brand-navy">
              {section.heading}
            </h2>
            <p className="mt-2 text-brand-slate leading-relaxed">{section.body}</p>
          </section>
        ))}

        <PortalHelpMedia videos={videos} />

        <p className="text-sm text-brand-slate">
          <Link
            href={PORTAL_PATHS.recovery}
            className="text-brand-cta hover:underline"
          >
            Request a new invite
          </Link>
          <span className="px-2 text-brand-slate/50">·</span>
          <Link href={PORTAL_PATHS.login} className="text-brand-cta hover:underline">
            Client portal sign-in
          </Link>
        </p>
      </article>
    </main>
  );
}
