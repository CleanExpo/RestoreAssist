"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChromePackage } from "@/components/brand/chrome-icons";
import { ADDON_PRICE_TERMS, AddonCardDeck } from "@/components/addons/AddonCardDeck";
import { SimpleWalkthrough } from "@/components/addons/SimpleWalkthrough";
import { Button } from "@/components/ui/button";
import { DashboardListPageHeader } from "@/app/dashboard/components/DashboardListPageHeader";
import { DashboardPageFrame } from "@/app/dashboard/components/DashboardPageFrame";
import { ADVANCED_WORKSPACE_EYEBROW } from "@/lib/dashboard/simple-dashboard-theme";
import { workspaceHubLinks } from "@/lib/dashboard/workspace-secondary-links";

export const ADDONS_CHECKOUT_CANCELLED_NOTICE =
  "You left the checkout before paying, so nothing was bought.";
export const ADDONS_CHECKOUT_DONE_NOTICE =
  "Thanks. Your pack shows as switched on below once payment is confirmed.";

/**
 * Field Add-Ons page (RA-8271). The cards are the same deck the setup wizard
 * shows, so a pack reads and behaves the same in both places. RA-8466: the
 * Simple walkthrough reopens here, and a checkout started here returns here.
 */
export default function AddonsClient() {
  const [guideOpen, setGuideOpen] = useState(false);
  const checkout = useSearchParams()?.get("checkout");
  const notice =
    checkout === "cancelled"
      ? ADDONS_CHECKOUT_CANCELLED_NOTICE
      : checkout === "done"
        ? ADDONS_CHECKOUT_DONE_NOTICE
        : null;

  return (
    <DashboardPageFrame className="w-full space-y-8 pb-10 pt-2">
      <DashboardListPageHeader
        eyebrow={ADVANCED_WORKSPACE_EYEBROW}
        title="Field Add-Ons"
        description="RestoreAssist is your CRM. Add the packs your business needs on top of your plan, when you need them."
        icon={<ChromePackage className="h-7 w-7 text-brand-harbour-700 dark:text-brand-harbour-400" aria-hidden />}
        secondaryLinks={workspaceHubLinks({ omitHref: "/dashboard/addons" })}
        primaryAction={
          <Link
            href="/dashboard/subscription"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-brand-mist dark:border-white/20 bg-brand-navy/5 dark:bg-white/5 px-4 text-sm font-medium text-brand-navy dark:text-white hover:bg-brand-cream dark:hover:bg-white/10"
          >
            Subscription settings
          </Link>
        }
      />

      {notice ? (
        <p
          role="status"
          className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-foreground"
        >
          {notice}
        </p>
      ) : null}

      {guideOpen ? (
        <SimpleWalkthrough mode="reopen" onClose={() => setGuideOpen(false)} />
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            New here? See one job go through your CRM, then what each pack adds.
          </p>
          <Button type="button" variant="outline" onClick={() => setGuideOpen(true)}>
            How Field Add-Ons work
          </Button>
        </div>
      )}

      <AddonCardDeck returnTo="addons" />

      <p className="border-t border-border pt-4 text-xs text-muted-foreground">
        {ADDON_PRICE_TERMS}
      </p>
    </DashboardPageFrame>
  );
}
