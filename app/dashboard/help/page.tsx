// app/dashboard/help/page.tsx
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { loadAllArticles } from "@/lib/help/load-article";
import { HELP_CATEGORIES, HELP_CATEGORY_LABELS, type HelpCategory } from "@/lib/help/types";
import HelpArticleCard from "@/components/help/HelpArticleCard";

export const dynamic = "force-dynamic";

export default async function HelpIndexPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login?callbackUrl=/dashboard/help");

  const articles = await loadAllArticles();

  return (
    <main className="container mx-auto max-w-5xl p-6">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-white">Help Library</h1>
        <p className="mt-2 text-white/60">Browse by category, or press <kbd className="rounded border border-white/20 px-1.5 py-0.5 text-xs">⌘K</kbd> to search.</p>
      </header>

      {HELP_CATEGORIES.map((cat) => {
        const inCat = articles.filter((a) => a.frontmatter.category === cat);
        return (
          <section key={cat} className="mb-12">
            <h2 className="mb-4 text-lg font-medium text-white/80">{HELP_CATEGORY_LABELS[cat as HelpCategory]}</h2>
            {inCat.length === 0 ? (
              <p className="text-sm text-white/40">More articles landing soon.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {inCat.map((a) => (
                  <HelpArticleCard
                    key={a.frontmatter.slug}
                    title={a.frontmatter.title}
                    category={a.frontmatter.category}
                    slug={a.frontmatter.slug}
                    aiSummary={a.frontmatter.aiSummary}
                    readTimeMin={a.frontmatter.readTimeMin}
                    updatedAt={a.frontmatter.updatedAt}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}
