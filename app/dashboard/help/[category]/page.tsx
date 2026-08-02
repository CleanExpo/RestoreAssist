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
import {
  DashboardPanel,
  dashboardSurfaceClass,
} from "@/app/dashboard/components/DashboardPanel";
import { cn } from "@/lib/utils";

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
  if (!session?.user?.id)
    redirect(`/login?callbackUrl=/dashboard/help/${category}`);
  if (!isCategory(category)) notFound();

  const articles = await loadCategoryIndex(category);
  const videoSlugs = CATEGORY_VIDEOS[category] ?? [];
  const videos = videoSlugs
    .map((slug) => ({ slug, ...VIDEO_REGISTRY[slug] }))
    .filter((v) => v.title);

  return (
    <div className="w-full space-y-6 px-4 sm:px-6 py-6 sm:py-8">
      <nav className="text-sm text-muted-foreground">
        <Link href="/dashboard/help" className="hover:text-foreground">
          Help
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground font-medium">
          {HELP_CATEGORY_LABELS[category]}
        </span>
      </nav>

      <header>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
          {HELP_CATEGORY_LABELS[category]}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Videos and articles for this topic.
        </p>
      </header>

      {videos.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">
            Video walkthroughs
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {videos.map((video) => (
              <Link
                key={video.slug}
                href={`/dashboard/learn?video=${video.slug}`}
                className={cn(
                  "group flex items-start gap-3 rounded-lg p-4 transition-colors",
                  dashboardSurfaceClass,
                  "hover:border-slate-300 dark:hover:border-slate-600",
                )}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <span aria-hidden="true">▶</span>
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-foreground group-hover:text-primary">
                    {video.title}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatDuration(video.durationSec)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Articles</h2>
        {articles.length === 0 ? (
          <DashboardPanel className="py-8 text-center text-sm text-muted-foreground">
            More articles landing soon.
          </DashboardPanel>
        ) : (
          <div className="flex flex-col gap-2.5">
            {articles.map((a, i) => (
              <HelpArticleCard
                key={a.frontmatter.slug}
                title={a.frontmatter.title}
                category={a.frontmatter.category}
                slug={a.frontmatter.slug}
                aiSummary={a.frontmatter.aiSummary}
                readTimeMin={a.frontmatter.readTimeMin}
                updatedAt={a.frontmatter.updatedAt}
                hideCategory
                variant="row"
                index={i + 1}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
