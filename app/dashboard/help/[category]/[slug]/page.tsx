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
import { Button } from "@/components/ui/button";
import { DashboardPanel } from "@/app/dashboard/components/DashboardPanel";

export const dynamic = "force-dynamic";

function isCategory(input: string): input is HelpCategory {
  return (HELP_CATEGORIES as readonly string[]).includes(input);
}

const mdxComponents = {
  Screenshot,
  VideoExplainer,
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
    <div className="w-full space-y-6 px-4 sm:px-6 py-6 sm:py-8">
      <nav className="text-sm text-muted-foreground">
        <Link href="/dashboard/help" className="hover:text-foreground">
          Help
        </Link>
        <span className="mx-2">/</span>
        <Link
          href={`/dashboard/help/${category}`}
          className="hover:text-foreground"
        >
          {HELP_CATEGORY_LABELS[category]}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground font-medium line-clamp-1">
          {frontmatter.title}
        </span>
      </nav>

      <header className="max-w-3xl">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-foreground leading-tight">
          {frontmatter.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{frontmatter.readTimeMin} min read</span>
          <span aria-hidden="true">·</span>
          <span>Updated {frontmatter.updatedAt}</span>
        </div>
      </header>

      {frontmatter.heroImage ? (
        <div className="max-w-4xl">
          <Screenshot
            src={frontmatter.heroImage}
            alt={`Hero image for ${frontmatter.title}`}
          />
        </div>
      ) : null}

      <DashboardPanel className="max-w-3xl">
        <article className="prose dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-foreground/90 prose-a:text-primary">
          <MDXRemote source={body} components={mdxComponents} />
        </article>
      </DashboardPanel>

      {frontmatter.relatedSlugs.length > 0 ? (
        <section className="max-w-3xl space-y-3 border-t border-border pt-6">
          <h2 className="text-lg font-semibold text-foreground">
            Related articles
          </h2>
          <ul className="space-y-2">
            {frontmatter.relatedSlugs.map((s) => (
              <li key={s}>
                <Link
                  href={`/dashboard/help/${category}/${s}`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  {s.replace(/-/g, " ")}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <DashboardPanel className="max-w-3xl text-center">
        <p className="text-sm text-muted-foreground">Still stuck?</p>
        <Button asChild className="mt-3">
          <Link href="/dashboard/help/contact">Contact support</Link>
        </Button>
      </DashboardPanel>
    </div>
  );
}
