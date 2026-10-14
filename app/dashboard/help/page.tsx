// app/dashboard/help/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { loadAllArticles } from "@/lib/help/load-article";
import {
  HELP_CATEGORIES,
  HELP_CATEGORY_LABELS,
  type HelpCategory,
} from "@/lib/help/types";
import HelpArticleCard from "@/components/help/HelpArticleCard";
import { Button } from "@/components/ui/button";
import {
  DashboardPanel,
  dashboardSurfaceClass,
} from "@/app/dashboard/components/DashboardPanel";
import { SimpleDashboardPageFrame } from "@/app/dashboard/components/SimpleDashboardPageFrame";
import {
  simpleDashboardHeroShell,
  simpleDashboardHeroShine,
  simpleDashboardShortcutLink,
} from "@/lib/dashboard/simple-dashboard-theme";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  BookOpen,
  Headphones,
  Keyboard,
  PlayCircle,
  Sparkles,
} from "lucide-react";
import { workspaceHubLinks } from "@/lib/dashboard/workspace-secondary-links";

export const dynamic = "force-dynamic";

const CATEGORY_BLURBS: Record<HelpCategory, string> = {
  "getting-started": "Account setup, first job, and day-one workflows",
  inspections: "Capture, moisture, photos, and field submission",
  reports: "Drafting, standards, export, and insurer-ready packs",
  "clients-and-portal": "Client access, sharing, and portal invites",
  billing: "Quotes, invoices, credits, and subscriptions",
  team: "Invites, roles, and workspace permissions",
  integrations: "Xero, accounting, and connected tools",
  compliance: "WHS, IICRC alignment, and evidence readiness",
};

export default async function HelpIndexPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login?callbackUrl=/dashboard/help");

  const articles = await loadAllArticles();
  const publishedCount = articles.length;
  const categoryCounts = Object.fromEntries(
    HELP_CATEGORIES.map((cat) => [
      cat,
      articles.filter((a) => a.frontmatter.category === cat).length,
    ]),
  ) as Record<HelpCategory, number>;
  const categoriesWithContent = HELP_CATEGORIES.filter(
    (cat) => categoryCounts[cat] > 0,
  );

  return (
    <SimpleDashboardPageFrame className="space-y-8 pb-10 pt-2">
      <header className={cn(simpleDashboardHeroShell)}>
        <div aria-hidden className={simpleDashboardHeroShine} />
        <div className="relative space-y-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 max-w-2xl">
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-cyan-200/90">
                <Sparkles className="h-3.5 w-3.5" />
                Simple workspace · Knowledge base
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Help &amp; Support
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-white/65 sm:text-base">
                Professional guides for RestoreAssist — from first inspection to
                insurer-ready reporting. Search anytime with{" "}
                <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 text-xs font-medium text-white/90">
                  ⌘K
                </kbd>
                .
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                asChild
                variant="outline"
                className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                <Link href="/dashboard/learn">
                  <PlayCircle className="mr-1.5 h-4 w-4" />
                  Video tutorials
                </Link>
              </Button>
              <Button
                asChild
                className="bg-cyan-500 text-white hover:bg-cyan-400"
              >
                <Link href="/dashboard/help/contact">
                  <Headphones className="mr-1.5 h-4 w-4" />
                  Contact support
                </Link>
              </Button>
            </div>
          </div>

          <div className="flex flex-row flex-wrap gap-3 border-t border-white/10 pt-5">
            <div className="flex min-w-[140px] flex-1 items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
              <BookOpen className="h-4 w-4 text-cyan-300" />
              <div>
                <p className="text-lg font-semibold tabular-nums text-white">
                  {publishedCount}
                </p>
                <p className="text-xs text-white/55">Articles</p>
              </div>
            </div>
            <div className="flex min-w-[140px] flex-1 items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
              <Keyboard className="h-4 w-4 text-cyan-300" />
              <div>
                <p className="text-lg font-semibold tabular-nums text-white">
                  {categoriesWithContent.length}
                </p>
                <p className="text-xs text-white/55">Categories</p>
              </div>
            </div>
            <Link
              href="/dashboard/learn"
              className="flex min-w-[180px] flex-1 items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm transition-colors hover:border-cyan-300/30 hover:bg-white/10"
            >
              <div>
                <p className="text-sm font-semibold text-white">Tutorials</p>
                <p className="text-xs text-white/55">Watch &amp; learn</p>
              </div>
              <ArrowRight className="h-4 w-4 text-white/50" />
            </Link>
            <Link
              href="/dashboard/help/contact"
              className="flex min-w-[180px] flex-1 items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm transition-colors hover:border-cyan-300/30 hover:bg-white/10"
            >
              <div>
                <p className="text-sm font-semibold text-white">Support</p>
                <p className="text-xs text-white/55">1 business day</p>
              </div>
              <ArrowRight className="h-4 w-4 text-white/50" />
            </Link>
          </div>
          <nav
            aria-label="Workspace shortcuts"
            className="grid grid-cols-2 gap-2 border-t border-white/10 pt-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          >
            {workspaceHubLinks({ omitHref: "/dashboard/help" }).map((link) => (
              <Link key={link.href} href={link.href} className={simpleDashboardShortcutLink}>
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {/* Category rail — horizontal flex row */}
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Browse by category
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Horizontal topic rail — pick a lane and go.
            </p>
          </div>
        </div>
        <div className="-mx-1 flex flex-row gap-3 overflow-x-auto px-1 pb-2 scroll-smooth [scrollbar-width:thin]">
          {HELP_CATEGORIES.map((cat) => {
            const count = categoryCounts[cat];
            return (
              <Link
                key={cat}
                href={`/dashboard/help/${cat}`}
                className={cn(
                  "group flex w-[240px] shrink-0 flex-col justify-between rounded-xl p-4 transition-all",
                  dashboardSurfaceClass,
                  "hover:border-slate-300 dark:hover:border-slate-500/80 hover:shadow-sm",
                )}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                      {HELP_CATEGORY_LABELS[cat]}
                    </h3>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                      {count}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                    {CATEGORY_BLURBS[cat]}
                  </p>
                </div>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary">
                  Open
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Article library — flex-row cards stacked */}
      <section className="space-y-8">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Article library
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Row layout for fast scanning — title, summary, and open in one line.
          </p>
        </div>

        {HELP_CATEGORIES.map((cat) => {
          const inCat = articles.filter((a) => a.frontmatter.category === cat);
          if (inCat.length === 0) return null;

          return (
            <div key={cat} className="space-y-3">
              <div className="flex flex-row flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-row items-baseline gap-3">
                  <h3 className="text-base font-semibold text-foreground">
                    {HELP_CATEGORY_LABELS[cat]}
                  </h3>
                  <span className="text-sm text-muted-foreground">
                    {inCat.length} article{inCat.length === 1 ? "" : "s"}
                  </span>
                </div>
                <Button asChild variant="ghost" size="sm" className="gap-1">
                  <Link href={`/dashboard/help/${cat}`}>
                    View all
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>

              {/* Flex column of row-cards (= unique horizontal card pattern) */}
              <div className="flex flex-col gap-2.5">
                {inCat.slice(0, 6).map((a, i) => (
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
            </div>
          );
        })}

        {publishedCount === 0 ? (
          <DashboardPanel className="py-12 text-center">
            <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-3 font-medium text-foreground">
              Help articles are coming soon
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Meanwhile, try video tutorials or contact support.
            </p>
            <div className="mt-5 flex flex-row flex-wrap justify-center gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/learn">Tutorials</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/dashboard/help/contact">Contact support</Link>
              </Button>
            </div>
          </DashboardPanel>
        ) : null}
      </section>
    </SimpleDashboardPageFrame>
  );
}
