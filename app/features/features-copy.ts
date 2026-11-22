import { PRICING_CONFIG } from "@/lib/pricing";

/**
 * RA-8542 — the Features page's trial and AI-key wording, in one module so a
 * test can compare it with lib/pricing.ts
 * (app/features/__tests__/trial-copy-matches-pricing.test.ts).
 *
 * The trial is Basic reports only, with no API key needed. Enhanced and
 * Optimised report types are paid features, enforced on the server by
 * lib/billing/paid-base-plan.ts. This page once said the trial matched the
 * paid plan on report types and that both plans run on the customer's own
 * key; the pricing config and the server gate say neither.
 */
const freeCfg = PRICING_CONFIG.free;
const monthlyCfg = PRICING_CONFIG.pricing.monthly;

// The Basic-report lines are read from the pricing config, not retyped.
const freeFeatures: readonly string[] = freeCfg.features;
const BASIC_REPORT_LINES = freeFeatures.filter((line) =>
  /basic report/i.test(line),
);

export const TRIAL_INCLUDES: readonly string[] = [
  `${freeCfg.trialDays} days, no credit card`,
  `${freeCfg.trialReportCredits} inspection report credits`,
  ...BASIC_REPORT_LINES,
  "The capture, evidence and export features above, on Basic reports",
];

export const PAID_ADDS: readonly string[] = [
  `${monthlyCfg.reportLimit} inspection reports a month, plus ${monthlyCfg.signupBonus} in your first`,
  "Enhanced and Optimised report types, which the trial does not include",
  "A monthly allowance that resets, in place of a one-off trial credit grant",
  "Your own labour, equipment and chemical rates, in place of the state defaults",
  // RA-7714: Ascora is a migration source, not an ongoing connection, and
  // both it and Xero are separately-priced add-ons, not part of the plan price.
  "Optional add-ons, including Migrate from Ascora",
  `Report packs when a month runs long, from $${PRICING_CONFIG.addons.pack8.amount} for ${PRICING_CONFIG.addons.pack8.reportLimit}`,
];

/** Footnote under the trial and paid columns. */
export const KEY_BILLING_NOTE =
  "Basic reports on the trial need no API key. A provider charges you only if you add your own Anthropic or OpenAI key, and we take no share.";
