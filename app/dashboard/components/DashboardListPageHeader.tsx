import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  simpleDashboardHeroShell,
  simpleDashboardHeroShine,
  simpleDashboardShortcutLink,
} from "@/lib/dashboard/simple-dashboard-theme";

type SecondaryLink = {
  href: string;
  label: string;
};

type Props = {
  title: string;
  description?: string;
  icon?: ReactNode;
  eyebrow?: string;
  primaryAction?: ReactNode;
  secondaryLinks?: SecondaryLink[];
  className?: string;
  /** Gradient hero matches /dashboard overview; default for simple workspace pages. */
  variant?: "gradient" | "plain";
};

export function DashboardListPageHeader({
  title,
  description,
  icon,
  eyebrow,
  primaryAction,
  secondaryLinks,
  className,
  variant = "gradient",
}: Props) {
  if (variant === "plain") {
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
            <div className="w-full shrink-0 sm:w-auto">{primaryAction}</div>
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

  return (
    <header className={cn(simpleDashboardHeroShell, className)}>
      <div aria-hidden className={simpleDashboardHeroShine} />
      <div className="relative space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            {eyebrow ? (
              <p className="text-xs font-semibold uppercase tracking-wider text-cyan-200/90">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              {icon ? (
                <span className="text-cyan-300 [&>svg]:h-7 [&>svg]:w-7">
                  {icon}
                </span>
              ) : null}
              {title}
            </h1>
            {description ? (
              <p className="max-w-3xl text-sm leading-relaxed text-white/65">
                {description}
              </p>
            ) : null}
          </div>
          {primaryAction ? (
            <div className="w-full shrink-0 lg:w-auto">{primaryAction}</div>
          ) : null}
        </div>
        {secondaryLinks && secondaryLinks.length > 0 ? (
          <nav
            aria-label="Related pages"
            className="grid grid-cols-2 gap-2 border-t border-white/10 pt-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          >
            {secondaryLinks.map((link) => (
              <Link key={link.href} href={link.href} className={simpleDashboardShortcutLink}>
                {link.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
    </header>
  );
}
