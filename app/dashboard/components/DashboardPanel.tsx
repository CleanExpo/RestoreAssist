import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Elevated surface matching WHS / Interviews — avoids black voids where --card === --background. */
export const dashboardSurfaceClass =
  "border border-neutral-200 dark:border-slate-700/60 bg-white dark:bg-slate-900/50";

/**
 * Shared presentational shell for dashboard analytics sections.
 * Matches Claims / WHS / Interviews card language (elevated surface, no glass).
 */
export function DashboardPanel({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg overflow-hidden",
        dashboardSurfaceClass,
        padded && "p-4 sm:p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DashboardPanelHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-4 sm:mb-6">
      <div className="min-w-0">
        <h3 className="text-base sm:text-lg font-semibold text-foreground">
          {title}
        </h3>
        {description ? (
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
