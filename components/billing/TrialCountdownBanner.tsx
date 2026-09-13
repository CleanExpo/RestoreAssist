"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import useTrialStatus from "@/lib/billing/use-trial-status";
import { TRIAL_EXPIRED_PAY_ROUTE } from "@/lib/billing/trial-expired-pay-route";

const SESSION_KEY = "dismissedTrialBanner";

export default function TrialCountdownBanner() {
  const { data, isLoading } = useTrialStatus();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(sessionStorage.getItem(SESSION_KEY) === "1");
  }, []);

  if (isLoading || !data) return null;

  if (data.hasTrialExpired && !data.lifetimeAccess) {
    return (
      <div
        data-testid="trial-expired-banner"
        className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm"
      >
        <div className="container mx-auto flex items-center justify-between">
          <span>
            Your trial has ended.{" "}
            <Link
              href={TRIAL_EXPIRED_PAY_ROUTE}
              data-testid="trial-expired-subscribe"
              className="font-medium underline"
            >
              Subscribe to continue
            </Link>
          </span>
        </div>
      </div>
    );
  }

  if (!data.showCountdownBanner || dismissed) return null;

  const days = data.daysRemaining;
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm">
      <div className="container mx-auto flex items-center justify-between">
        <span>
          Your trial ends in <strong>{days} {days === 1 ? "day" : "days"} left</strong>.{" "}
          <Link href="/billing/upgrade?reason=voluntary" className="underline">
            Upgrade now
          </Link>{" "}
          to keep your access.
        </span>
        <button
          type="button"
          onClick={() => {
            sessionStorage.setItem(SESSION_KEY, "1");
            setDismissed(true);
          }}
          aria-label="Dismiss"
          className="ml-4 min-h-[44px] min-w-[44px] p-2"
        >
          ×
        </button>
      </div>
    </div>
  );
}
