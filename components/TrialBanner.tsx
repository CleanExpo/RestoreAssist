"use client";

/**
 * TrialBanner — RA-1241
 *
 * Persistent dashboard urgency banner for trialing users. Shows
 * "X days left in trial — upgrade to keep your reports" with a one-click
 * CTA to /dashboard/pricing. Colour escalates:
 *
 *   > 3 days:       amber
 *   ≤ 3 days:       orange
 *   ≤ 1 day:        red
 *
 * Silent when subscriptionStatus != "TRIAL" or trial is already expired.
 * Fetches /api/user/trial-status once on mount; safe to fail silently.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Clock, X } from "lucide-react";

type TrialStatus = {
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  daysRemaining: number | null;
};

const DISMISS_STORAGE_KEY = "ra-1241-trial-banner-dismissed-session";

export function TrialBanner() {
  const [status, setStatus] = useState<TrialStatus | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(false);

  useEffect(() => {
    // Session-scoped dismissal — not persisted, so the banner returns next
    // session when urgency is higher. Intentional.
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem(DISMISS_STORAGE_KEY);
      if (stored === "1") setDismissed(true);
    }

    fetch("/api/user/trial-status", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setStatus(d))
      .catch(() => setStatus(null));
  }, []);

  if (dismissed) return null;
  if (!status) return null;
  if (status.subscriptionStatus !== "TRIAL") return null;
  if (status.daysRemaining === null || status.daysRemaining < 0) return null;

  const d = status.daysRemaining;

  // Colour escalation — amber → orange → red as the trial winds down.
  const tone =
    d <= 1
      ? {
          bg: "bg-rose-500/10 dark:bg-rose-900/30",
          border: "border-rose-500/40 dark:border-rose-700/50",
          text: "text-rose-700 dark:text-rose-300",
          icon: "text-rose-500",
          cta:
            "bg-rose-500 hover:bg-rose-600 text-white",
        }
      : d <= 3
      ? {
          bg: "bg-orange-500/10 dark:bg-orange-900/30",
          border: "border-orange-500/40 dark:border-orange-700/50",
          text: "text-orange-700 dark:text-orange-300",
          icon: "text-orange-500",
          cta:
            "bg-orange-500 hover:bg-orange-600 text-white",
        }
      : {
          bg: "bg-amber-500/10 dark:bg-amber-900/30",
          border: "border-amber-500/40 dark:border-amber-700/50",
          text: "text-amber-700 dark:text-amber-300",
          icon: "text-amber-500",
          cta:
            "bg-amber-500 hover:bg-amber-600 text-white",
        };

  const daysLabel =
    d === 0 ? "Trial ends today" : d === 1 ? "1 day left in trial" : `${d} days left in trial`;

  return (
    <div
      className={`border-b ${tone.bg} ${tone.border}`}
      role="status"
      aria-live="polite"
    >
      <div className="max-w-9xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        <div className={`flex items-center gap-2 text-sm font-medium ${tone.text}`}>
          <Clock size={16} className={tone.icon} />
          <span>
            {daysLabel} — upgrade to keep your reports.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/pricing"
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors min-h-[36px] inline-flex items-center ${tone.cta}`}
          >
            Upgrade now
          </Link>
          <button
            onClick={() => {
              setDismissed(true);
              if (typeof window !== "undefined") {
                sessionStorage.setItem(DISMISS_STORAGE_KEY, "1");
              }
            }}
            className={`p-1.5 rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/10 min-h-[36px] min-w-[36px] inline-flex items-center justify-center ${tone.text}`}
            aria-label="Dismiss trial banner for this session"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
