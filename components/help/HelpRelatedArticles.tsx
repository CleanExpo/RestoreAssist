import Link from "next/link";
import type { LoadedArticle } from "@/lib/help/load-article";

type HelpLinkBase = "/help" | "/dashboard/help";

export function HelpRelatedArticles({
  articles,
  basePath,
  tone = "dashboard",
}: {
  articles: LoadedArticle[];
  basePath: HelpLinkBase;
  tone?: "public" | "dashboard";
}) {
  if (articles.length === 0) return null;

  const headingClass =
    tone === "public"
      ? "text-lg font-semibold text-white"
      : "text-lg font-semibold text-foreground";
  const linkClass =
    tone === "public"
      ? "text-sm font-medium text-brand-gold hover:underline"
      : "text-sm font-medium text-primary hover:underline";

  return (
    <section className="max-w-3xl space-y-3 border-t border-border pt-6 mt-10">
      <h2 className={headingClass}>Related articles</h2>
      <ul className="space-y-2">
        {articles.map((article) => {
          const { category, slug, title } = article.frontmatter;
          return (
            <li key={`${category}/${slug}`}>
              <Link href={`${basePath}/${category}/${slug}`} className={linkClass}>
                {title}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
