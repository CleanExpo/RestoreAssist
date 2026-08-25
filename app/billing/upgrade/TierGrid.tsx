"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ChromeCheck } from "@/components/brand/chrome-icons";
import { PRICING_CONFIG } from "@/lib/pricing";
import CheckoutCTA from "./CheckoutCTA";

/**
 * RA-6929/6930/6931 — single-catalog collapse (C1/C3). One $99 Monthly Plan
 * card sourced from the SSOT catalog. Display amounts/features only — never
 * Stripe price ids (those stay server-side).
 */
export default function TierGrid({
  isCurrentPlan = false,
}: {
  isCurrentPlan?: boolean;
}) {
  const plan = PRICING_CONFIG.pricing.monthly;
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className="mx-auto w-full max-w-lg"
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      <article
        className="relative overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-lg shadow-black/20 ring-1 ring-brand-navy/20 dark:ring-brand-gold/15"
        aria-labelledby="upgrade-plan-title"
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-linear-to-r from-brand-navy via-brand-bronze to-brand-gold"
          aria-hidden
        />

        <div className="p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Monthly plan
              </p>
              <h2
                id="upgrade-plan-title"
                className="mt-1 text-2xl font-semibold tracking-tight text-foreground"
              >
                {plan.displayName}
              </h2>
            </div>
            {isCurrentPlan ? (
              <span className="rounded-md bg-success px-2.5 py-1 text-xs font-medium text-success-foreground">
                Current plan
              </span>
            ) : (
              <span className="rounded-md bg-brand-navy px-2.5 py-1 text-xs font-medium text-white">
                Full access
              </span>
            )}
          </div>

          <p className="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-5xl font-bold tracking-tight text-foreground tabular-nums">
              ${plan.amount}
            </span>
            <span className="text-base text-muted-foreground">/mo AUD</span>
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Incl. GST · Billed monthly
          </p>

          <div className="mt-8 border-t border-border pt-6">
            <h3 className="text-sm font-semibold text-foreground">
              What you get
            </h3>
            <ul className="mt-4 space-y-3">
              {plan.features.map((f) => (
                <li key={f} className="flex gap-3 text-sm leading-snug text-foreground">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                    <ChromeCheck className="h-3.5 w-3.5" />
                  </span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>

          <CheckoutCTA />
        </div>
      </article>
    </motion.div>
  );
}
