"use client";

/**
 * Client chrome for /dashboard/margot/* — tabs + header.
 * Auth is enforced by the server layout via requireAdminPage().
 */

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { RAIcon } from "@/components/brand/RAIcon";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  MARGOT_AVATAR_ORB_PATH,
  MARGOT_DISPLAY_NAME,
} from "@/lib/margot-surface";
import { DashboardPageFrame } from "@/app/dashboard/components/DashboardPageFrame";

const TABS = [
  {
    href: "/dashboard/margot/home",
    label: "Overview",
    icon: "report",
    match: (path: string) => path.startsWith("/dashboard/margot/home"),
  },
  {
    href: "/dashboard/margot",
    label: "Chat",
    icon: "ai",
    match: (path: string) =>
      path === "/dashboard/margot" || path === "/dashboard/margot/",
  },
  {
    href: "/dashboard/margot/social",
    label: "Social training",
    icon: "shield",
    match: (path: string) => path.startsWith("/dashboard/margot/social"),
  },
  {
    href: "/dashboard/mission-control",
    label: "Mission Control",
    icon: "task",
    match: (path: string) => path.startsWith("/dashboard/mission-control"),
  },
] as const;

export function MargotSectionChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const isOverview = pathname.startsWith("/dashboard/margot/home");

  return (
    <DashboardPageFrame className="space-y-6 pb-10 pt-2">
      {!isOverview ? (
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border/80 pb-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full ring-2 ring-cyan-500/30">
              <Image
                src={MARGOT_AVATAR_ORB_PATH}
                alt=""
                fill
                className="object-cover"
                sizes="44px"
                priority
              />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  {MARGOT_DISPLAY_NAME}
                </h1>
                <Badge variant="secondary" className="font-normal">
                  Admin
                </Badge>
              </div>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Ops briefings, Linear, Telegram, and social-comment training.
                Restoration here means property and insurance work — never cars,
                teeth, or other false matches.
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/admin"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Admin home
          </Link>
        </header>
      ) : null}

      <nav
        className="flex flex-wrap gap-1 rounded-xl border border-border/80 bg-muted/25 p-1 backdrop-blur-sm"
        aria-label="Margot sections"
      >
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "inline-flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-gradient-to-r from-cyan-500/15 to-indigo-500/10 text-foreground shadow-sm ring-1 ring-inset ring-cyan-400/25"
                  : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              <RAIcon name={tab.icon} size={16} decorative />
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </DashboardPageFrame>
  );
}
