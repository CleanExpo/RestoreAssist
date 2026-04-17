"use client";

import { useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

interface Props {
  status: string | null;
}

/**
 * PastDueBanner — renders a dunning banner when the user's subscription
 * is PAST_DUE (failed payment). Clicking "Update Payment Method" opens
 * the Stripe Customer Portal so they can fix their card and restore
 * access without leaving the app.
 *
 * Closes RA-1244 — PAST_DUE users previously saw no in-app recovery
 * UI and typically churned silently.
 */
export function PastDueBanner({ status }: Props) {
  const [loading, setLoading] = useState(false);

  if (status !== "PAST_DUE") return null;

  const openPortal = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/subscription/portal", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Portal returned ${res.status}`);
      }
      const { url } = await res.json();
      if (url) {
        window.location.href = url;
      } else {
        throw new Error("Portal did not return a URL");
      }
    } catch (err) {
      console.error("Failed to open billing portal:", err);
      toast.error(
        err instanceof Error
          ? err.message
          : "Unable to open billing portal — please try again or contact support.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="alert"
      className="sticky top-16 z-10 -mx-2 sm:-mx-4 lg:-mx-6 px-4 sm:px-6 py-3 bg-red-600 text-white shadow-md"
    >
      <div className="max-w-9xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <AlertCircle className="shrink-0" size={20} />
          <div className="min-w-0">
            <p className="font-semibold text-sm">Payment failed</p>
            <p className="text-xs text-red-100 truncate">
              Your last charge didn't go through. Access to AI features is
              paused until you update your payment method.
            </p>
          </div>
        </div>
        <button
          onClick={openPortal}
          disabled={loading}
          className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-red-700 text-sm font-semibold hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Opening…
            </>
          ) : (
            "Update Payment Method"
          )}
        </button>
      </div>
    </div>
  );
}
