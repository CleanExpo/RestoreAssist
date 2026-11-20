import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  DASHBOARD_PAGE_MAX_WIDTH,
  simpleDashboardMeshGradient,
} from "@/lib/dashboard/simple-dashboard-theme";
import {
  upgradeGlowOrb,
  upgradeGlowOrbSecondary,
  upgradeLatticeOverlay,
} from "@/lib/billing/upgrade-page-theme";

/** Standalone billing routes (/billing/*) — same mesh + width as dashboard. */
export function BillingUpgradeShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="relative isolate min-h-screen overflow-x-hidden bg-background dark:bg-slate-950">
      <div aria-hidden className={simpleDashboardMeshGradient} />
      <div aria-hidden className={upgradeLatticeOverlay} />
      <div aria-hidden className={upgradeGlowOrb} />
      <div aria-hidden className={upgradeGlowOrbSecondary} />
      <main
        className={cn(
          "relative mx-auto w-full px-4 py-8 sm:px-6 sm:py-10 lg:px-8",
          DASHBOARD_PAGE_MAX_WIDTH,
          className,
        )}
      >
        {children}
      </main>
    </div>
  );
}
