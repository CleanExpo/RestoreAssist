/**
 * Pure quote calculation helpers shared by POST /api/calculate and tests.
 * Amounts are in AUD dollars (not cents) — matches the Quote Generator UI.
 */

import { z } from "zod";
import { getGstTreatment, type Country } from "@/lib/gst-rules";
import {
  calculateInvoiceTotals,
  dollarsToCents,
  lineAmountsCents,
  lineSubtotalCents,
} from "@/lib/invoices/calc";

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

/**
 * The quote's GST and inc-GST total, computed exactly as the AR invoice
 * drafted from it will compute them: GST per line, then summed.
 *
 * RA-7705: the quote used to take GST on the ex-GST total while the invoice
 * draft takes it per line, so a $2,750 minimum-charge quote showed $275.00
 * GST and its invoice draft charged $275.01. It also rounded in binary
 * floating point ($2,750.85 → $275.08 GST, not $275.09).
 */
export function quoteGstAsInvoiced(
  quote: {
    lineItems: Array<{ description: string; qty: number; rate: number }>;
    subtotalExGST: number;
  },
  country: Country,
): {
  gst: number;
  totalIncGST: number;
} {
  const ratePercent = getGstTreatment(country).ratePercent;
  const totals = calculateInvoiceTotals({
    lineItems: quoteToInvoiceLineItems(quote, ratePercent),
    defaultGstRatePercent: ratePercent,
  });
  return {
    gst: totals.gstAmount / 100,
    totalIncGST: totals.totalIncGST / 100,
  };
}

/** One quote row's two customer prices, in AUD dollars (RA-7896). */
export interface QuoteLinePrice {
  exGST: number;
  incGST: number;
}

/**
 * Each quote row's price ex GST and inc GST, worked out per line exactly as
 * the AR invoice drafted from the quote will work them out (RA-7896, RA-7705):
 * the line rounded to cents, then GST on that rounded line.
 *
 * `lines` lines up one-to-one with `quote.lineItems`. When the minimum charge
 * padded the subtotal, `minimumChargeLine` is the top-up row the invoice draft
 * carries, so the quote shows it as its own row. Summed, the rows' inc-GST
 * prices equal `quoteGstAsInvoiced(...).totalIncGST`.
 */
export function quoteLinePricesAsInvoiced(
  quote: {
    lineItems: Array<{ description: string; qty: number; rate: number }>;
    subtotalExGST: number;
  },
  country: Country,
): {
  lines: QuoteLinePrice[];
  minimumChargeLine: (QuoteLinePrice & { description: string }) | null;
} {
  const ratePercent = getGstTreatment(country).ratePercent;
  const invoiceLines = quoteToInvoiceLineItems(quote, ratePercent);
  const priced = invoiceLines.map((li) => {
    const cents = lineAmountsCents(li.quantity, li.unitPrice, li.gstRate);
    return { exGST: cents.subtotal / 100, incGST: cents.total / 100 };
  });
  const n = quote.lineItems.length;
  return {
    lines: priced.slice(0, n),
    minimumChargeLine:
      invoiceLines.length > n
        ? { description: invoiceLines[n].description, ...priced[n] }
        : null,
  };
}

/** Dollars → integer cents for AR Invoice persistence (shared with invoices). */
export { dollarsToCents };

/**
 * A stored rate rounded to whole cents. Pricing config keeps rates as Float
 * and does not limit decimal places, so $65.005 is a valid stored rate; the
 * invoice draft can only carry 6501c. The quote prices every line on this
 * same whole-cent rate so its totals equal the draft's (RA-7705).
 */
export function wholeCentRate(rate: number): number {
  return dollarsToCents(rate) / 100;
}

/** One POST /api/invoices line built from a quote (unitPrice in cents). */
export interface QuoteInvoiceLineItem {
  description: string;
  category: string;
  quantity: number;
  unitPrice: number;
  gstRate: number;
}

/**
 * Turn a calculated quote into the line items of its AR invoice draft.
 * If the minimum charge padded the subtotal without a matching line, a
 * top-up line carries the difference.
 */
export function quoteToInvoiceLineItems(
  quote: {
    lineItems: Array<{ description: string; qty: number; rate: number }>;
    subtotalExGST: number;
  },
  gstRatePercent: number,
): QuoteInvoiceLineItem[] {
  const lineItems: QuoteInvoiceLineItem[] = quote.lineItems.map((li) => ({
    description: li.description,
    category: "Quote",
    quantity: li.qty,
    unitPrice: dollarsToCents(li.rate),
    gstRate: gstRatePercent,
  }));
  const linesEx = lineItems.reduce(
    (sum, li) => sum + lineSubtotalCents(li.quantity, li.unitPrice),
    0,
  );
  const targetEx = dollarsToCents(quote.subtotalExGST);
  if (targetEx > linesEx) {
    lineItems.push({
      description: "Minimum engagement charge (industry minimum)",
      category: "Quote",
      quantity: 1,
      unitPrice: targetEx - linesEx,
      gstRate: gstRatePercent,
    });
  }
  return lineItems;
}
