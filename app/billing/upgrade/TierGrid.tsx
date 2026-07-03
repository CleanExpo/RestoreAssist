"use client";

import { PRICING_CONFIG } from "@/lib/pricing";
import CheckoutCTA from "./CheckoutCTA";

/**
 * RA-6929/6930/6931 — single-catalog collapse (C1/C3). The retired multi-tier
 * grid is replaced by the one $99 Monthly Plan card sourced from the single
 * source-of-truth catalog. Every expired trial funnelled here (F1) lands on
 * this purchasable $99 CTA.
 */
export default function TierGrid({ isCurrentPlan = false }: { isCurrentPlan?: boolean }) {
  const plan = PRICING_CONFIG.pricing.monthly;

  return (
    <div className="mx-auto max-w-md">
      <div className="relative rounded-lg border border-brand-navy p-6 text-left ring-2 ring-brand-navy">
        {isCurrentPlan && (
          <span className="absolute -top-3 left-4 rounded bg-green-600 px-2 py-0.5 text-xs text-white">
            Current plan
          </span>
        )}
        <h2 className="text-xl font-semibold">{plan.displayName}</h2>
        <p className="mt-2 text-2xl font-bold">
          ${plan.amount}
          <span className="text-sm font-normal text-muted-foreground">/mo</span>
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          {plan.features.map((f) => (
            <li key={f}>• {f}</li>
          ))}
        </ul>
      </div>
      <CheckoutCTA />
    </div>
  );
}
