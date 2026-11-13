"use client";

import Link from "next/link";
import {
  PAID_BASE_PLAN_MESSAGE,
  PAID_BASE_PLAN_UPGRADE_HREF,
} from "@/lib/billing/paid-base-plan-copy";

/** L-2 — honest trial vs paid copy on dashboard billing surfaces. */
export function PaidPlanFeatureNotice({
  subscriptionStatus,
}: {
  subscriptionStatus?: string | null;
}) {
  if (subscriptionStatus === "ACTIVE") return null;

  return (
    <div
      role="note"
      className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
    >
      <p className="font-medium">Trial plan limits</p>
      <p className="mt-1 text-amber-900/90 dark:text-amber-100/90">
        {PAID_BASE_PLAN_MESSAGE}
      </p>
      <Link
        href={PAID_BASE_PLAN_UPGRADE_HREF}
        className="mt-2 inline-flex min-h-10 items-center font-semibold text-amber-950 underline dark:text-amber-50"
      >
        View upgrade options
      </Link>
    </div>
  );
}
