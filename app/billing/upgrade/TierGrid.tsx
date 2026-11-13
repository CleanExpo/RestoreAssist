"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ChromeCheck } from "@/components/brand/chrome-icons";
import { PRICING_CONFIG } from "@/lib/pricing";
import CheckoutCTA from "./CheckoutCTA";
import {
  upgradePricingInner,
  upgradePricingShell,
} from "@/lib/billing/upgrade-page-theme";
import { cn } from "@/lib/utils";

/**
 * RA-6929/6930/6931 — single-catalog collapse (C1/C3). One $99 Monthly Plan
 * card sourced from the SSOT catalog. Display amounts/features only — never
 * Stripe price ids (those stay server-side).
 */
export default function TierGrid({
  isCurrentPlan = false,
  className,
}: {
  isCurrentPlan?: boolean;
  className?: string;
}) {
  const plan = PRICING_CONFIG.pricing.monthly;
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={cn("relative w-full", className)}
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="pointer-events-none absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-r from-cyan-500/20 via-indigo-500/10 to-transparent blur-2xl" />

      <article
        className={cn(upgradePricingShell)}
        aria-labelledby="upgrade-plan-title"
      >
        <div
          className="pointer-events-none absolute right-6 top-0 h-24 w-24 bg-[radial-gradient(circle,rgba(34,211,238,0.25),transparent_70%)]"
          aria-hidden
        />
        <div className={upgradePricingInner}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300/90">
                Recommended · Full workspace
              </p>
              <h2
                id="upgrade-plan-title"
                className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl"
              >
                {plan.displayName} plan
              </h2>
              <p className="mt-2 max-w-md text-sm text-white/60">
                Everything you need to run jobs, produce insurer-ready reports,
                and bill clients — one predictable monthly price.
              </p>
            </div>
            {isCurrentPlan ? (
              <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200">
                Current plan
              </span>
            ) : (
              <span className="rounded-full border border-cyan-400/40 bg-cyan-500/15 px-3 py-1 text-xs font-semibold text-cyan-100">
                Most popular
              </span>
            )}
          </div>

          <div className="mt-8 flex flex-wrap items-end gap-x-4 gap-y-2 border-b border-white/10 pb-8">
            <p className="flex items-baseline gap-2">
              <span className="text-5xl font-bold tabular-nums tracking-tight text-white sm:text-6xl">
                ${plan.amount % 1 === 0 ? plan.amount : plan.amount.toFixed(2)}
              </span>
              <span className="text-lg text-white/50">/mo AUD</span>
            </p>
            <p className="text-sm text-white/45">
              GST inclusive · Billed monthly · Cancel anytime
            </p>
          </div>

          <div className="mt-8">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-white/70">
              Included every month
            </h3>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {plan.features.map((f) => (
                <li
                  key={f}
                  className="flex gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3 text-sm leading-snug text-white/85"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-300">
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
