"use client";

import { useState } from "react";
import { PRICING_CONFIG } from "@/lib/pricing";

/**
 * RA-6929/6930/6931 — the expired-trial hard-paywall CTA now sells the single
 * $99 Monthly Plan through the canonical checkout route (F1). If the user
 * already holds a live subscription the server returns 409 with a billing
 * portal URL — send them there instead of creating a second subscription.
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
        body: JSON.stringify({ priceId: PRICING_CONFIG.prices.monthly }),
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
    <div className="mt-6 text-center">
      <button
        type="button"
        onClick={go}
        disabled={loading}
        className="rounded bg-brand-navy px-8 py-3 text-white disabled:opacity-50 min-h-[44px]"
      >
        {loading ? "Redirecting…" : "Subscribe for $99/month"}
      </button>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </div>
  );
}
