"use client";

import Link from "next/link";
import { ChromePackage } from "@/components/brand/chrome-icons";
import { AddonCardDeck } from "@/components/addons/AddonCardDeck";
import { DashboardListPageHeader } from "@/app/dashboard/components/DashboardListPageHeader";
import { DashboardPageFrame } from "@/app/dashboard/components/DashboardPageFrame";
import { ADVANCED_WORKSPACE_EYEBROW } from "@/lib/dashboard/simple-dashboard-theme";
import { workspaceHubLinks } from "@/lib/dashboard/workspace-secondary-links";

/**
 * Field Add-Ons page (RA-8271). The cards are the same deck the setup wizard
 * shows, so a pack reads and behaves the same in both places.
 */
export default function AddonsClient() {
  return (
    <DashboardPageFrame className="w-full space-y-8 pb-10 pt-2">
      <DashboardListPageHeader
        eyebrow={ADVANCED_WORKSPACE_EYEBROW}
        title="Field Add-Ons"
        description="RestoreAssist is your CRM. Add the packs your business needs on top of your plan, when you need them."
        icon={<ChromePackage className="h-7 w-7 text-cyan-400" aria-hidden />}
        secondaryLinks={workspaceHubLinks({ omitHref: "/dashboard/addons" })}
        primaryAction={
          <Link
            href="/dashboard/subscription"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/20 bg-white/5 px-4 text-sm font-medium text-white hover:bg-white/10"
          >
            Subscription settings
          </Link>
        }
      />

      <AddonCardDeck />

      <p className="border-t border-border pt-4 text-xs text-muted-foreground">
        Prices are GST inclusive. Each pack is a separate subscription you can
        cancel any time from Subscription settings.
      </p>
    </DashboardPageFrame>
  );
}
