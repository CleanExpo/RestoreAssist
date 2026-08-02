import Link from "next/link";
import { ArrowUpRight, Clock } from "lucide-react";
import { HELP_CATEGORY_LABELS, type HelpCategory } from "@/lib/help/types";
import { dashboardSurfaceClass } from "@/app/dashboard/components/DashboardPanel";
import { cn } from "@/lib/utils";

export type HelpArticleCardProps = {
  title: string;
  category: HelpCategory;
  slug: string;
  aiSummary: string;
  readTimeMin: number;
  updatedAt: string;
  /** Hide category chip when already inside a category section */
  hideCategory?: boolean;
  /** Horizontal flex-row card (default). Use "tile" for square grid cards. */
  variant?: "row" | "tile";
  /** Optional index for row pattern (01, 02…) */
  index?: number;
};

export default function HelpArticleCard({
  title,
  category,
  slug,
  aiSummary,
  readTimeMin,
  updatedAt,
  hideCategory = false,
  variant = "row",
  index,
}: HelpArticleCardProps) {
  if (variant === "tile") {
    return (
      <Link
        href={`/dashboard/help/${category}/${slug}`}
        className={cn(
          "group flex h-full min-w-[260px] flex-col rounded-xl p-5 transition-all",
          dashboardSurfaceClass,
          "hover:border-slate-300 dark:hover:border-slate-500/80 hover:shadow-sm",
        )}
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {!hideCategory ? (
            <span className="rounded-md border border-border bg-muted/60 px-2 py-0.5 font-medium text-foreground/80">
              {HELP_CATEGORY_LABELS[category]}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {readTimeMin} min
          </span>
        </div>
        <h3 className="mt-3 text-base sm:text-lg font-semibold tracking-tight text-foreground group-hover:text-primary transition-colors">
          {title}
        </h3>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground line-clamp-3">
          {aiSummary}
        </p>
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-border/70 pt-3">
          <span className="text-xs text-muted-foreground">
            Updated {updatedAt}
          </span>
          <ArrowUpRight className="h-4 w-4 text-primary opacity-70 group-hover:opacity-100 transition-opacity" />
        </div>
      </Link>
    );
  }

  // Unique flex-row pattern: index rail · body · meta/cta
  return (
    <Link
      href={`/dashboard/help/${category}/${slug}`}
      className={cn(
        "group relative flex min-w-0 flex-row items-stretch overflow-hidden rounded-xl transition-all",
        dashboardSurfaceClass,
        "hover:border-slate-300 dark:hover:border-slate-500/80 hover:shadow-md hover:shadow-slate-900/5 dark:hover:shadow-black/20",
      )}
    >
      {/* Accent rail */}
      <div
        className="w-1 shrink-0 bg-gradient-to-b from-primary via-primary/70 to-primary/20"
        aria-hidden="true"
      />

      <div className="flex min-w-0 flex-1 flex-row items-center gap-4 px-4 py-4 sm:gap-5 sm:px-5 sm:py-4">
        {typeof index === "number" ? (
          <span className="hidden sm:block shrink-0 font-mono text-xs font-semibold tabular-nums tracking-wider text-muted-foreground/80">
            {String(index).padStart(2, "0")}
          </span>
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {!hideCategory ? (
              <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground/80">
                {HELP_CATEGORY_LABELS[category]}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {readTimeMin} min read
            </span>
            <span className="hidden md:inline text-muted-foreground/70">
              · Updated {updatedAt}
            </span>
          </div>
          <h3 className="mt-1.5 text-base font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary sm:text-[1.05rem]">
            {title}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground line-clamp-2">
            {aiSummary}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2 self-center">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-muted/40 text-foreground transition-all group-hover:border-primary/40 group-hover:bg-primary/10 group-hover:text-primary">
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="hidden text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:block">
            Open
          </span>
        </div>
      </div>
    </Link>
  );
}
