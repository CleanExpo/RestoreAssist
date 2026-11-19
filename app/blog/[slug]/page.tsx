import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getArticleBySlug, getPublishedSlugs } from "@/lib/blog/articles";
import BlogArticle from "./BlogArticle";
import { OG_SHARE_IMAGE } from "@/lib/og/constants";

/**
 * Statically pre-render one route per published article. Any slug not in this
 * list falls through to notFound() below, so there are no dead article URLs.
 */
export function generateStaticParams(): { slug: string }[] {
  return getPublishedSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) {
    return { title: "Article not found - RestoreAssist Blog" };
  }

  return {
    title: `${article.title} - RestoreAssist Blog`,
    description: article.description,
    keywords: article.keywords,
    authors: [{ name: article.author }],
    openGraph: {
      title: article.title,
      description: article.description,
      type: "article",
      publishedTime: article.isoDate,
      images: [
        OG_SHARE_IMAGE,
      ],
    },
    alternates: { canonical: `/blog/${article.slug}` },
  };
}

export default async function BlogArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) {
    notFound();
  }

  return <BlogArticle article={article} />;
}
