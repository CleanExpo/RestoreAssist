"use client";

import { motion } from "framer-motion";
import { PRICING_CONFIG } from "@/lib/pricing";
import { RAIcon } from "@/components/brand/RAIcon";
import {
  fadeUp,
  staggerContainer,
  VIEWPORT,
  CONTAINER,
  FONT_DISPLAY,
  SECTION_PAD,
  SECTION_EYEBROW,
  SURFACE,
} from "@/components/landing/home/motion";
import { useLandingReduceMotion } from "@/components/landing/home/useLandingReduceMotion";

/**
 * Full cost disclosure for the public pricing page.
 *
 * Two separate parties charge a contractor who runs Restore Assist, and this
 * component names both in one place:
 *
 *   1. Restore Assist — every subscription and add-on charge, itemised from
 *      PRICING_CONFIG (lib/pricing.ts) so the page can never drift from the
 *      catalogue the checkout actually sells from. The effective per-report
 *      rate is derived by division from those same authored numbers.
 *
 *   2. The customer's AI provider — report generation runs on the customer's
 *      own Anthropic or OpenAI key, billed directly by that provider.
 *
 * DELIBERATELY UNQUANTIFIED: the per-report AI cost. There is no authored
 * figure for it anywhere in this repository. The main report-generation route
 * (app/api/reports/generate-inspection-report/route.ts) caps output at 16,000
 * tokens but bounds neither input tokens nor the model the customer selects,
 * and it does not run through the per-call cost cap in lib/ai/task-policy.ts.
 * A per-report dollar amount therefore cannot be computed from anything this
 * codebase actually enforces. Rather than print a number we cannot stand
 * behind, this component states what the cost is, who is paid, that Restore
 * Assist takes no share of it, and where the buyer can read the current rates
 * for themselves. Do not add an estimate here without a real, cited source.
 */

type CostRow = {
  key: string;
  label: string;
  amount: string;
  cadence: string;
  included: string;
  perReport: string;
};

/** Match the plan cards: whole dollars stay whole, cents get two places. */
function formatAud(amount: number): string {
  return amount % 1 === 0 ? `$${amount}` : `$${amount.toFixed(2)}`;
}

/** Effective software cost per report — plain division of authored figures. */
function perReportRate(amount: number, reports: number): string {
  if (reports <= 0) return "Not applicable";
  return `$${(amount / reports).toFixed(2)}`;
}

export interface CostDisclosureProps {
  className?: string;
}

export function CostDisclosure({ className }: CostDisclosureProps) {
  const reduce = useLandingReduceMotion();

  const free = PRICING_CONFIG.free;
  const monthly = PRICING_CONFIG.pricing.monthly;

  const rows: CostRow[] = [
    {
      key: "free",
      label: free.displayName,
      amount: formatAud(free.amount),
      cadence: `once, for ${free.trialDays} days`,
      included: `${free.trialReportCredits} report credits and ${free.trialQuickFillCredits} Quick Fill credits`,
      perReport: perReportRate(free.amount, free.trialReportCredits),
    },
    {
      key: "monthly",
      label: monthly.displayName,
      amount: formatAud(monthly.amount),
      cadence: `per ${monthly.interval}`,
      included: `${monthly.reportLimit} inspection reports per ${monthly.interval}, plus ${monthly.signupBonus} bonus reports in your first ${monthly.interval}`,
      perReport: perReportRate(monthly.amount, monthly.reportLimit),
    },
    ...Object.values(PRICING_CONFIG.addons).map((addon) => ({
      key: addon.name,
      label: addon.displayName,
      amount: formatAud(addon.amount),
      cadence: "per pack, when you buy one",
      included: `${addon.reportLimit} additional reports`,
      perReport: perReportRate(addon.amount, addon.reportLimit),
    })),
  ];

  return (
    <section
      className={`bg-[#F3F5F7] border-t border-slate-200/90 ${SECTION_PAD} ${className ?? ""}`}
    >
      <div className={CONTAINER}>
        <motion.div
          variants={staggerContainer}
          initial={reduce ? false : "hidden"}
          whileInView="visible"
          viewport={VIEWPORT}
          className="mx-auto max-w-4xl"
        >
          <motion.div variants={fadeUp} className="max-w-2xl">
            <p className={SECTION_EYEBROW}>Cost disclosure</p>
            <h2
              className={`${FONT_DISPLAY} mt-4 text-3xl font-semibold tracking-tight text-[#0B1F3A] sm:text-4xl`}
            >
              Everything you pay to run Restore Assist
            </h2>
            <p className="mt-5 text-base leading-relaxed text-slate-600">
              Two parties charge you. We are one of them. Both are set out
              below, including the cost we do not bill and cannot quote for
              you.
            </p>
          </motion.div>

          {/* 1 — What Restore Assist bills. */}
          <motion.div variants={fadeUp} className={`${SURFACE} mt-10 p-7 sm:p-8`}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-[#3B6D8C]">
                <RAIcon name="invoice" size={20} decorative />
              </span>
              <div>
                <h3
                  className={`${FONT_DISPLAY} text-xl font-semibold tracking-tight text-[#0B1F3A]`}
                >
                  1. Billed by Restore Assist
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  This is the complete price list. There is no setup fee, no
                  per-seat fee, and no charge to export your own reports.
                </p>
              </div>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
                <caption className="sr-only">
                  Restore Assist subscription and add-on charges, with the
                  effective software cost per inspection report.
                </caption>
                <thead>
                  <tr className="border-b border-slate-200">
                    <th
                      scope="col"
                      className="py-3 pr-4 font-semibold text-[#0B1F3A]"
                    >
                      Charge
                    </th>
                    <th
                      scope="col"
                      className="py-3 pr-4 font-semibold text-[#0B1F3A]"
                    >
                      Amount
                    </th>
                    <th
                      scope="col"
                      className="py-3 pr-4 font-semibold text-[#0B1F3A]"
                    >
                      What it covers
                    </th>
                    <th
                      scope="col"
                      className="py-3 text-right font-semibold text-[#0B1F3A]"
                    >
                      Per report
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.key}
                      className="border-b border-slate-200/70 align-top"
                    >
                      <th
                        scope="row"
                        className="py-4 pr-4 font-medium text-[#0B1F3A]"
                      >
                        {row.label}
                      </th>
                      <td className="py-4 pr-4 text-slate-600">
                        <span className="font-semibold text-[#0B1F3A]">
                          {row.amount}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {row.cadence}
                        </span>
                      </td>
                      <td className="py-4 pr-4 leading-relaxed text-slate-600">
                        {row.included}
                      </td>
                      <td className="py-4 text-right font-semibold text-[#0B1F3A]">
                        {row.perReport}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-5 text-xs leading-relaxed text-slate-500">
              Amounts in {monthly.currency}. Plan pricing includes GST and tax
              invoices are issued monthly. The per-report column is the plan or
              pack price divided by the reports it covers. Cancel any time.
            </p>
          </motion.div>

          {/* 2 — What the AI provider bills. The honest gap. */}
          <motion.div variants={fadeUp} className={`${SURFACE} mt-6 p-7 sm:p-8`}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-[#3B6D8C]">
                <RAIcon name="ai" size={20} decorative />
              </span>
              <div>
                <h3
                  className={`${FONT_DISPLAY} text-xl font-semibold tracking-tight text-[#0B1F3A]`}
                >
                  2. Billed by your AI provider, not by us
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Report generation on every plan, including the{" "}
                  {free.trialDays}-day free trial, runs on your own Anthropic or
                  OpenAI API key. That is a real out-of-pocket cost of using
                  this product, so it belongs on this page.
                </p>
              </div>
            </div>

            <dl className="mt-6 space-y-5 border-t border-slate-200/70 pt-6">
              <div className="sm:flex sm:gap-6">
                <dt className="text-sm font-semibold text-[#0B1F3A] sm:w-44 sm:shrink-0">
                  Who charges you
                </dt>
                <dd className="mt-1 text-sm leading-relaxed text-slate-600 sm:mt-0">
                  Anthropic or OpenAI bill your account directly, on their own
                  published token rates. The payment never passes through us.
                </dd>
              </div>

              <div className="sm:flex sm:gap-6">
                <dt className="text-sm font-semibold text-[#0B1F3A] sm:w-44 sm:shrink-0">
                  Our margin on it
                </dt>
                <dd className="mt-1 text-sm leading-relaxed text-slate-600 sm:mt-0">
                  None. Restore Assist adds no markup and takes no share. It is
                  why the subscription above is priced as it is.
                </dd>
              </div>

              <div className="sm:flex sm:gap-6">
                <dt className="text-sm font-semibold text-[#0B1F3A] sm:w-44 sm:shrink-0">
                  The amount
                </dt>
                <dd className="mt-1 text-sm leading-relaxed text-slate-600 sm:mt-0">
                  We do not publish a per-report figure, because we cannot give
                  you an honest one. It moves with the model you select and the
                  size of the report you generate, and we would rather name the
                  cost and leave it open than quote an average that turns out to
                  be wrong on your jobs. Read the current rates at{" "}
                  <a
                    href="https://www.anthropic.com/pricing"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-[#3B6D8C] underline underline-offset-2 hover:text-[#0B1F3A]"
                  >
                    anthropic.com/pricing
                  </a>{" "}
                  and{" "}
                  <a
                    href="https://openai.com/api/pricing"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-[#3B6D8C] underline underline-offset-2 hover:text-[#0B1F3A]"
                  >
                    openai.com/api/pricing
                  </a>
                  . Your provider console shows exactly what you have spent.
                </dd>
              </div>

              <div className="sm:flex sm:gap-6">
                <dt className="text-sm font-semibold text-[#0B1F3A] sm:w-44 sm:shrink-0">
                  What you control
                </dt>
                <dd className="mt-1 text-sm leading-relaxed text-slate-600 sm:mt-0">
                  You choose the provider and model under Settings, then AI
                  Providers, and you can revoke the key at any time. Usage stops
                  when you stop generating reports.
                </dd>
              </div>
            </dl>
          </motion.div>

          <motion.p
            variants={fadeUp}
            className="mt-6 text-center text-xs leading-relaxed text-slate-500"
          >
            If a cost is missing from this page, that is a fault we want to
            hear about, not a detail we left out on purpose.
          </motion.p>
        </motion.div>
      </div>
    </section>
  );
}

export default CostDisclosure;
