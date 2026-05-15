import { notFound } from "next/navigation";
import { loadArticle } from "@/lib/help/load-article";
import { HELP_CATEGORIES, HELP_CATEGORY_LABELS, type HelpCategory } from "@/lib/help/types";
import Screenshot from "@/components/help/Screenshot";
import Link from "next/link";
import { MDXRemote } from "next-mdx-remote/rsc";

export const dynamic = "force-static";
export const revalidate = 3600;

function isCategory(input: string): input is HelpCategory {
  return (HELP_CATEGORIES as readonly string[]).includes(input);
}

export default async function PublicArticlePage({
  params,
}: {
  params: Promise<{ category: string; slug: string }>;
}) {
  const { category, slug } = await params;
  if (!isCategory(category)) notFound();

  const article = await loadArticle(category, slug);
  if (!article) notFound();

  const { frontmatter, body } = article;

  // Articles with audience excluding "client" + "tradie"/"admin" only show on authed surface — 404 here
  if (!frontmatter.audience.includes("client") && frontmatter.audience.every((a) => a !== "tradie" && a !== "admin")) {
    notFound();
  }

  return (
    <main className="container mx-auto max-w-3xl p-6">
      <nav className="mb-4 text-sm text-white/50">
        <Link href="/help" className="hover:text-white">Help</Link>
        <span className="mx-2">/</span>
        <span className="text-white">{HELP_CATEGORY_LABELS[category]}</span>
      </nav>

      <h1 className="text-3xl md:text-4xl font-semibold text-white leading-tight">{frontmatter.title}</h1>

      <div className="mt-4 flex items-center gap-3 text-sm text-white/60">
        <span>{frontmatter.readTimeMin} min read</span>
      </div>

      {frontmatter.heroImage && (
        <Screenshot
          src={frontmatter.heroImage}
          alt={`Hero image for ${frontmatter.title}`}
        />
      )}

      <article className="prose prose-invert mt-8 max-w-none">
        <MDXRemote source={body} components={{ Screenshot }} />
      </article>
    </main>
  );
}
