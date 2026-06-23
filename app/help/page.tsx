import { loadAllArticles } from "@/lib/help/load-article";
import { HELP_CATEGORIES, HELP_CATEGORY_LABELS, type HelpCategory } from "@/lib/help/types";
import Link from "next/link";

export const dynamic = "force-static";
export const revalidate = 3600;

export default async function PublicHelpIndex() {
  const articles = await loadAllArticles();

  return (
    <main className="container mx-auto max-w-5xl p-6">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-white">RestoreAssist Help</h1>
        <p className="mt-2 text-white/60">Public knowledge base. Browse by category.</p>
      </header>

      {HELP_CATEGORIES.map((cat) => {
        const inCat = articles.filter((a) => a.frontmatter.category === cat);
        return (
          <section key={cat} className="mb-12">
            <h2 className="mb-4 text-lg font-medium text-white/80">{HELP_CATEGORY_LABELS[cat as HelpCategory]}</h2>
            {inCat.length === 0 ? (
              <p className="text-sm text-white/40">More articles landing soon.</p>
            ) : (
              <ul className="space-y-2">
                {inCat.map((a) => (
                  <li key={a.frontmatter.slug}>
                    <Link
                      href={`/help/${a.frontmatter.category}/${a.frontmatter.slug}`}
                      className="text-brand-gold hover:text-[#E6BB8E]"
                    >
                      {a.frontmatter.title}
                    </Link>
                    <span className="ml-2 text-xs text-white/40">· {a.frontmatter.readTimeMin} min</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </main>
  );
}
