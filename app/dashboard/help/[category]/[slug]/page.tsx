// app/dashboard/help/[category]/[slug]/page.tsx
import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { loadArticle } from "@/lib/help/load-article";
import {
  HELP_CATEGORIES,
  HELP_CATEGORY_LABELS,
  type HelpCategory,
} from "@/lib/help/types";
import Screenshot from "@/components/help/Screenshot";
import { VideoExplainer } from "@/components/setup/VideoExplainer";
import Link from "next/link";
import { MDXRemote } from "next-mdx-remote/rsc";

export const dynamic = "force-dynamic";

function isCategory(input: string): input is HelpCategory {
  return (HELP_CATEGORIES as readonly string[]).includes(input);
}

const mdxComponents = {
  Screenshot,
  VideoExplainer,
  // Future: Callout, StepList, Kbd
};

export default async function HelpArticlePage({
  params,
}: {
  params: Promise<{ category: string; slug: string }>;
}) {
  const session = await getServerSession(authOptions);
  const { category, slug } = await params;
  if (!session?.user?.id)
    redirect(`/login?callbackUrl=/dashboard/help/${category}/${slug}`);
  if (!isCategory(category)) notFound();

  const article = await loadArticle(category, slug);
  if (!article) notFound();

  const { frontmatter, body } = article;

  return (
    <main className="container mx-auto max-w-3xl p-6">
      <nav className="mb-4 text-sm text-white/50">
        <Link href="/dashboard/help" className="hover:text-white">
          Help
        </Link>
        <span className="mx-2">/</span>
        <Link href={`/dashboard/help/${category}`} className="hover:text-white">
          {HELP_CATEGORY_LABELS[category]}
        </Link>
      </nav>

      <h1 className="text-3xl md:text-4xl font-semibold text-white leading-tight">
        {frontmatter.title}
      </h1>

      <div className="mt-4 flex items-center gap-3 text-sm text-white/60">
        <span>{frontmatter.readTimeMin} min read</span>
        <span>·</span>
        <span>Updated {frontmatter.updatedAt}</span>
      </div>

      {frontmatter.heroImage && (
        <Screenshot
          src={frontmatter.heroImage}
          alt={`Hero image for ${frontmatter.title}`}
        />
      )}

      <article className="prose prose-invert mt-8 max-w-none">
        <MDXRemote source={body} components={mdxComponents} />
      </article>

      {frontmatter.relatedSlugs.length > 0 && (
        <section className="mt-12 border-t border-white/10 pt-8">
          <h2 className="text-lg font-medium text-white/80">
            Related articles
          </h2>
          <ul className="mt-3 space-y-2">
            {frontmatter.relatedSlugs.map((s) => (
              <li key={s}>
                <Link
                  href={`/dashboard/help/${category}/${s}`}
                  className="text-sm text-brand-gold hover:text-brand-gold-hover"
                >
                  {s.replace(/-/g, " ")}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-12 rounded-lg border border-white/10 bg-brand-surface p-6 text-center">
        <p className="text-sm text-white/70">Still stuck?</p>
        <Link
          href="/dashboard/support"
          className="mt-3 inline-block rounded bg-brand-cta px-6 py-2 text-sm text-white hover:bg-brand-cta-hover min-h-[44px]"
        >
          Contact support
        </Link>
      </section>
    </main>
  );
}
