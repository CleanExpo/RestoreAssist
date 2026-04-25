"use client";

import { useEffect, useState } from "react";
import { Clock, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

/**
 * CancellationCountdownBanner — amber sticky banner that shows when the
 * user has cancelled but still has access (cancelAtPeriodEnd=true). Gives
 * them a countdown to lock-out + one-click Reactivate so they don't need
 * to find the Subscription page.
 *
 * Closes RA-1256. Complements PastDueBanner (RA-1244).
 */
export function CancellationCountdownBanner() {
  const [state, setState] = useState<{
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: number;
  } | null>(null);
  const [reactivating, setReactivating] = useState(false);

  useEffect(() => {
    fetch("/api/subscription")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.subscription?.cancelAtPeriodEnd) {
          setState({
            cancelAtPeriodEnd: true,
            currentPeriodEnd: data.subscription.currentPeriodEnd,
          });
        }
      })
      .catch((err) => console.error("[CancellationCountdownBanner]", err));
  }, []);

  if (!state?.cancelAtPeriodEnd) return null;

  const endDate = new Date(state.currentPeriodEnd * 1000);
  const daysLeft = Math.max(
    0,
    Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
  );
  const endFormatted = endDate.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const reactivate = async () => {
    setReactivating(true);
    try {
      const res = await fetch("/api/reactivate-subscription", {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Subscription reactivated");
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reactivate");
    } finally {
      setReactivating(false);
    }
  };

  return (
    <div
      role="alert"
      className="sticky top-16 z-10 -mx-2 sm:-mx-4 lg:-mx-6 px-4 sm:px-6 py-3 bg-amber-600 text-white shadow-md"
    >
      <div className="max-w-9xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Clock className="shrink-0" size={20} />
          <div className="min-w-0">
            <p className="font-semibold text-sm">
              Subscription cancels{" "}
              {daysLeft === 0
                ? "today"
                : `in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
            </p>
            <p className="text-xs text-amber-100 truncate">
              You keep full access until {endFormatted}. Reactivate anytime to
              keep your data and reports.
            </p>
          </div>
        </div>
        <button
          onClick={reactivate}
          disabled={reactivating}
          className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-amber-700 text-sm font-semibold hover:bg-amber-50 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {reactivating ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Reactivating…
            </>
          ) : (
            "Reactivate"
          )}
        </button>
      </div>
    </div>
  );
}
