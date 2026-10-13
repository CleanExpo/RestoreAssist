import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type SecondaryLink = {
  href: string;
  label: string;
};

type Props = {
  title: string;
  description?: string;
  icon?: ReactNode;
  primaryAction?: ReactNode;
  secondaryLinks?: SecondaryLink[];
  className?: string;
};

/** Consistent list-page hero: purpose, primary action, related shortcuts. */
export function DashboardListPageHeader({
  title,
  description,
  icon,
  primaryAction,
  secondaryLinks,
  className,
}: Props) {
  return (
    <header className={cn("space-y-3", className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-neutral-900 dark:text-white">
            {icon}
            {title}
          </h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-sm text-neutral-500 dark:text-slate-400">
              {description}
            </p>
          ) : null}
        </div>
        {primaryAction ? (
          <div className="shrink-0 w-full sm:w-auto">{primaryAction}</div>
        ) : null}
      </div>
      {secondaryLinks && secondaryLinks.length > 0 ? (
        <nav
          aria-label="Related pages"
          className="flex flex-wrap gap-2 text-sm"
        >
          {secondaryLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex min-h-11 items-center rounded-lg border border-neutral-200 px-3 font-medium text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
