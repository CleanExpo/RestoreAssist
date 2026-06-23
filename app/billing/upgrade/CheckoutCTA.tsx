"use client";

import { useState } from "react";

export default function CheckoutCTA({ tier }: { tier: "STANDARD" | "PREMIUM" | "ENTERPRISE" }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const body = await res.json();
      if (!res.ok || !body.data?.url) throw new Error(body.error?.message ?? "Checkout failed");
      window.location.href = body.data.url;
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
        {loading ? "Redirecting…" : `Continue with ${tier}`}
      </button>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
