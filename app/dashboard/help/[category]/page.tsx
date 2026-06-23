// app/dashboard/help/[category]/page.tsx
import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { loadCategoryIndex } from "@/lib/help/load-article";
import {
  HELP_CATEGORIES,
  HELP_CATEGORY_LABELS,
  type HelpCategory,
} from "@/lib/help/types";
import { CATEGORY_VIDEOS } from "@/lib/help/category-videos";
import { VIDEO_REGISTRY } from "@/components/setup/video-registry";
import HelpArticleCard from "@/components/help/HelpArticleCard";
import Link from "next/link";

export const dynamic = "force-dynamic";

function isCategory(input: string): input is HelpCategory {
  return (HELP_CATEGORIES as readonly string[]).includes(input);
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default async function HelpCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const session = await getServerSession(authOptions);
  const { category } = await params;
  if (!session?.user?.id) redirect(`/login?callbackUrl=/dashboard/help/${category}`);
  if (!isCategory(category)) notFound();

  const articles = await loadCategoryIndex(category);
  const videoSlugs = CATEGORY_VIDEOS[category] ?? [];
  const videos = videoSlugs
    .map((slug) => ({ slug, ...VIDEO_REGISTRY[slug] }))
    .filter((v) => v.title);

  return (
    <main className="container mx-auto max-w-5xl p-6">
      <nav className="mb-4 text-sm text-white/50">
        <Link href="/dashboard/help" className="hover:text-white">Help</Link>
        <span className="mx-2">/</span>
        <span className="text-white">{HELP_CATEGORY_LABELS[category]}</span>
      </nav>
      <h1 className="text-3xl font-semibold text-white">{HELP_CATEGORY_LABELS[category]}</h1>

      {/* Video Walkthroughs Section */}
      {videos.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-4 text-lg font-semibold text-white">Video Walkthroughs</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {videos.map((video) => (
              <Link
                key={video.slug}
                href={`/dashboard/learn?video=${video.slug}`}
                className="group relative overflow-hidden rounded-xl border border-white/10 bg-[#0E1320] p-4 hover:border-brand-bronze/50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-navy group-hover:bg-brand-bronze/20">
                    <span className="h-5 w-5 text-brand-bronze group-hover:text-white" aria-hidden="true">▶</span>
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-white group-hover:text-brand-gold">
                      {video.title}
                    </div>
                    <div className="mt-1 text-xs text-white/50">
                      {formatDuration(video.durationSec)}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Articles Section */}
      <section className="mt-10">
        <h2 className="mb-4 text-lg font-semibold text-white">Articles</h2>
        {articles.length === 0 ? (
          <p className="text-sm text-white/50">More articles landing soon.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {articles.map((a) => (
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
    </main>
  );
}
