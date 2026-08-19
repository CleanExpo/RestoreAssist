"use client";

import { useState } from "react";
import { Lock, RotateCcw, Receipt } from "lucide-react";

/**
 * RA-6929/6930/6931 — the expired-trial hard-paywall CTA sells the single
 * $99 Monthly Plan through the canonical checkout route (F1).
 *
 * Sends `{ plan: "monthly" }` — never a Stripe price id. Client bundles cannot
 * read STRIPE_PRICE_MONTHLY; the server resolves the real price from env.
 * If the user already holds a live subscription the server returns 409 with a
 * billing portal URL — send them there instead of creating a second sub.
 */
export default function CheckoutCTA() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan: "monthly" }),
      });
      const body = await res.json();

      // Already subscribed — route to the billing portal to change plans.
      if (res.status === 409 && body.url) {
        window.location.href = body.url;
        return;
      }

      if (!res.ok || !body.url) {
        throw new Error(
          body.error?.message ?? body.error ?? "Checkout failed",
        );
      }
      window.location.href = body.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
      setLoading(false);
    }
  }

  return (
    <div className="mt-8 space-y-5">
      <button
        type="button"
        onClick={go}
        disabled={loading}
        className="w-full rounded-xl bg-brand-navy px-8 py-3.5 text-base font-semibold text-white shadow-md shadow-brand-navy/25 transition-[background-color,opacity,transform] hover:bg-brand-navy-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-50 min-h-12 active:scale-[0.99]"
      >
        {loading ? "Redirecting to secure checkout…" : "Subscribe — $99/month"}
      </button>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-2">
        <li className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground sm:flex-col sm:gap-1.5">
          <Lock className="h-3.5 w-3.5 shrink-0 text-foreground/70" aria-hidden />
          <span>Secured by Stripe</span>
        </li>
        <li className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground sm:flex-col sm:gap-1.5">
          <RotateCcw
            className="h-3.5 w-3.5 shrink-0 text-foreground/70"
            aria-hidden
          />
          <span>Cancel anytime</span>
        </li>
        <li className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground sm:flex-col sm:gap-1.5">
          <Receipt
            className="h-3.5 w-3.5 shrink-0 text-foreground/70"
            aria-hidden
          />
          <span>AUD incl. GST</span>
        </li>
      </ul>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive-subtle-foreground/30 bg-destructive-subtle px-3 py-2 text-sm text-destructive-subtle-foreground"
        >
          {error}
        </p>
      )}
    </div>
  );
}
