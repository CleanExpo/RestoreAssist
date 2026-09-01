/**
 * Pure quote calculation helpers shared by POST /api/calculate and tests.
 * Amounts are in AUD dollars (not cents) — matches the Quote Generator UI.
 */

import { z } from "zod";
import { getGstTreatment, type Country } from "@/lib/gst-rules";

/** Minimum charge enforced on all quotes (ex-GST), AUD dollars. */
export const MINIMUM_CHARGE_EX_GST = 2750;

export const QuoteRequestSchema = z.object({
  jobType: z.enum(["water", "fire", "mould", "storm", "bioclean"]),
  /**
   * Active mould on this job, independent of jobType.
   *
   * Needed because jobType alone cannot express the commonest real case: a
   * WATER job with mould growth. Without this the S520 air-mover gate would
   * only ever fire on a job someone had already labelled "mould", which is the
   * case least likely to be mis-priced.
   */
  mouldActive: z.boolean().default(false),
  affectedAreaM2: z.number().min(1).max(10000),
  numberOfRooms: z.number().int().min(1).max(50),
  dryingDays: z.number().int().min(1).max(30),
  labourHours: z.number().min(0).max(500),
  labourTier: z
    .enum(["masterQualified", "qualifiedTechnician", "labourer"])
    .default("qualifiedTechnician"),
  labourPeriod: z
    .enum(["NormalHours", "Saturday", "Sunday"])
    .default("NormalHours"),
  airMoversAxial: z.number().int().min(0).max(50).default(0),
  airMoversCentrifugal: z.number().int().min(0).max(50).default(0),
  dehumidifiersLGR: z.number().int().min(0).max(20).default(0),
  dehumidifiersDesiccant: z.number().int().min(0).max(20).default(0),
  afdUnitsLarge: z.number().int().min(0).max(10).default(0),
  extractionTruckMountedHours: z.number().min(0).max(24).default(0),
  extractionElectricHours: z.number().min(0).max(24).default(0),
  injectionDryingDays: z.number().int().min(0).max(30).default(0),
  includeCallOut: z.boolean().default(true),
  includeAdminFee: z.boolean().default(true),
  includeThermalCamera: z.boolean().default(false),
  clientName: z.string().max(200).optional(),
  clientAddress: z.string().max(500).optional(),
  clientPhone: z.string().max(50).optional(),
  clientEmail: z.string().email().optional().or(z.literal("")),
  jobDescription: z.string().max(2000).optional(),
});

export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;

export function applyMinimumCharge(subtotalExGST: number): {
  subtotalExGST: number;
  minimumApplied: boolean;
  minimumChargeAmount: number;
} {
  const rounded = Math.round(subtotalExGST * 100) / 100;
  const minimumApplied = rounded < MINIMUM_CHARGE_EX_GST;
  return {
    subtotalExGST: minimumApplied ? MINIMUM_CHARGE_EX_GST : rounded,
    minimumApplied,
    minimumChargeAmount: MINIMUM_CHARGE_EX_GST,
  };
}

export function calcGstOnSubtotal(
  subtotalExGST: number,
  country: Country = "AU",
): {
  gst: number;
  totalIncGST: number;
} {
  const gst =
    Math.round(subtotalExGST * getGstTreatment(country).rate * 100) / 100;
  const totalIncGST = Math.round((subtotalExGST + gst) * 100) / 100;
  return { gst, totalIncGST };
}

/** Dollars → integer cents for AR Invoice persistence. */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}
