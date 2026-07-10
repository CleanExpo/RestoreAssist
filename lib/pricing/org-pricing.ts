/**
 * RA-7026 Phase 1 — per-contractor pricing grounding for Margot.
 *
 * Margot must answer pricing questions from the *contractor's own* configured
 * rates (the ones entered during setup and stored in `OrganizationPricingConfig`),
 * never a global/hardcoded rate card. This module is the read + gate + format
 * layer the chat route injects into the system prompt.
 *
 * Why the ORG table (not `CompanyPricingConfig`): the setup wizard
 * (`components/setup/PricingCard.tsx` → `/api/setup/pricing`) writes
 * `OrganizationPricingConfig` keyed by `organizationId`. That IS "the prices they
 * input on setup". Reconciling it with the user-keyed estimation table is a
 * separate follow-up (see docs/specs/2026-07-10-margot-per-contractor-pricing.md).
 */

import type { PrismaClient } from "@prisma/client";

/**
 * Fires only when the message is plausibly a pricing question — otherwise the
 * "YOUR CONFIGURED RATES" block would be injected into every casual thread and
 * waste the context budget (mirrors the STANDARDS_HINT gate in the chat route).
 */
// NOTE: bare "rate(s)" is deliberately NOT matched — "drying rate", "air-change
// rate", "flow rate" are technical, not pricing. "rate" only counts with a
// pricing qualifier (my/your/charge/hourly/day/labour rate, rate card, $/hr).
export const PRICING_HINT =
  /\bpric(?:e|es|ing)\b|\bcharge(?:-?out)?\b|\bquot(?:e|ing)\b|\binvoic(?:e|ing)\b|\bcall-?out\b|\bafter-?hours\b|\brate\s?card\b|\bday-?rate\b|\b(?:my|our|your|charge(?:-?out)?|standard|flat|hourly|daily|day|labour|labor)\s(?:rates?|prices?)\b|\$\s?\/?\s?(?:hr|hour|day)\b|\bper\s(?:hour|day)\b|\bhow\smuch\s(?:should|do|can)\s(?:i|we|they)\b/i;

/** The subset of `OrganizationPricingConfig` Margot reasons about. */
export interface OrgPricingRates {
  // Labour, per hour (normal / business hours)
  labourerNormalHours: number;
  qualifiedTechnicianNormalHours: number;
  masterQualifiedNormalHours: number;
  // Equipment, per day
  airMoverAxialDailyRate: number;
  airMoverCentrifugalDailyRate: number;
  dehumidifierLGRDailyRate: number;
  dehumidifierDesiccantDailyRate: number;
  afdUnitLargeDailyRate: number;
  negativeAirMachineDailyRate: number | null;
  hepaVacuumDailyRate: number | null;
  // Fees
  administrationFee: number;
  callOutFee: number;
  mobilisationFee: number | null;
  thermalCameraUseCostPerAssessment: number;
  // Loading multipliers
  afterHoursMultiplier: number;
  saturdayMultiplier: number;
  sundayMultiplier: number;
  publicHolidayMultiplier: number;
}

/** Minimal Prisma surface — lets tests pass a stub without the full client. */
export type OrgPricingReader = Pick<PrismaClient, "organizationPricingConfig">;

const PRICING_SELECT = {
  labourerNormalHours: true,
  qualifiedTechnicianNormalHours: true,
  masterQualifiedNormalHours: true,
  airMoverAxialDailyRate: true,
  airMoverCentrifugalDailyRate: true,
  dehumidifierLGRDailyRate: true,
  dehumidifierDesiccantDailyRate: true,
  afdUnitLargeDailyRate: true,
  negativeAirMachineDailyRate: true,
  hepaVacuumDailyRate: true,
  administrationFee: true,
  callOutFee: true,
  mobilisationFee: true,
  thermalCameraUseCostPerAssessment: true,
  afterHoursMultiplier: true,
  saturdayMultiplier: true,
  sundayMultiplier: true,
  publicHolidayMultiplier: true,
} as const;

/**
 * The contractor's configured rates, or `null` when they have no pricing row
 * (organizationId absent, or setup pricing step never completed).
 */
export async function getEffectiveOrgPricing(
  prisma: OrgPricingReader,
  organizationId: string | null | undefined,
): Promise<OrgPricingRates | null> {
  if (!organizationId) return null;
  return prisma.organizationPricingConfig.findUnique({
    where: { organizationId },
    select: PRICING_SELECT,
  });
}

/** Drop trailing `.0` so `85.0` renders as `85` but `82.5` stays `82.5`. */
function money(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * The prompt block. `null` → an imperative "not configured" instruction so
 * Margot sends the user to setup instead of fabricating a rate.
 */
export function formatOrgPricingBlock(rates: OrgPricingRates | null): string {
  if (!rates) {
    return [
      "\n\n--- CONTRACTOR PRICING (not configured) ---\n",
      "This contractor has not set their charge-out rates. Do NOT quote a specific ",
      "price or use any national/default figure. Tell them to enter their rates in ",
      "Settings → Pricing, then you can advise on charging.\n",
    ].join("");
  }

  const equip: string[] = [
    `air mover (axial) ${money(rates.airMoverAxialDailyRate)}`,
    `air mover (centrifugal) ${money(rates.airMoverCentrifugalDailyRate)}`,
    `dehumidifier LGR ${money(rates.dehumidifierLGRDailyRate)}`,
    `dehumidifier desiccant ${money(rates.dehumidifierDesiccantDailyRate)}`,
    `AFD/air scrubber ${money(rates.afdUnitLargeDailyRate)}`,
  ];
  if (rates.negativeAirMachineDailyRate != null)
    equip.push(`negative-air machine ${money(rates.negativeAirMachineDailyRate)}`);
  if (rates.hepaVacuumDailyRate != null)
    equip.push(`HEPA vacuum ${money(rates.hepaVacuumDailyRate)}`);

  const fees: string[] = [
    `administration ${money(rates.administrationFee)}`,
    `call-out ${money(rates.callOutFee)}`,
    `thermal-camera assessment ${money(rates.thermalCameraUseCostPerAssessment)}`,
  ];
  if (rates.mobilisationFee != null)
    fees.push(`mobilisation ${money(rates.mobilisationFee)}`);

  return [
    "\n\n--- YOUR CONFIGURED CHARGE-OUT RATES (ex-GST AUD — use THESE, never a generic or national figure) ---\n",
    `Labour, per hour (business hours): labourer ${money(rates.labourerNormalHours)}, `,
    `qualified technician ${money(rates.qualifiedTechnicianNormalHours)}, `,
    `master/senior technician ${money(rates.masterQualifiedNormalHours)}.\n`,
    `Equipment, per day: ${equip.join(", ")}.\n`,
    `Fees: ${fees.join(", ")}.\n`,
    `Loadings: after-hours ×${money(rates.afterHoursMultiplier)}, `,
    `Saturday ×${money(rates.saturdayMultiplier)}, `,
    `Sunday ×${money(rates.sundayMultiplier)}, `,
    `public holiday ×${money(rates.publicHolidayMultiplier)}.\n`,
    "Answer pricing questions using ONLY these rates — they are the contractor's own ",
    "configured charge-out rates. Apply the loading multipliers for after-hours, weekend ",
    "and public-holiday work. Never substitute a national median, a figure that appears ",
    "elsewhere in this prompt (including any standards/knowledge context), or any other ",
    "number.\n",
  ].join("");
}

/**
 * Gate + read + format, ready to append to the system prompt. Returns "" when
 * the message is not a pricing question (block is not injected). Best-effort —
 * a DB error yields "" rather than breaking the chat.
 */
export async function buildPricingGrounding(
  prisma: OrgPricingReader,
  organizationId: string | null | undefined,
  query: string,
): Promise<string> {
  if (!query || !PRICING_HINT.test(query)) return "";
  try {
    const rates = await getEffectiveOrgPricing(prisma, organizationId);
    return formatOrgPricingBlock(rates);
  } catch {
    return "";
  }
}
