/**
 * RA-875: GST Treatment Rules — per line item category
 *
 * Single source of truth for GST tax-type classification of line items on
 * Australian invoices. Reference: ATO GSTR 2000/10.
 *
 * This is DIFFERENT from {@link ../gst-rules#getGstTreatment}:
 *   - gst-rules: country-level rate + accounting-platform tax codes (AU 10% / NZ 15%)
 *   - gst-treatment-rules (this file): category-level treatment (taxable / exempt / input / none)
 *
 * Both can coexist; a sync might call both: country determines the rate,
 * category determines whether GST applies at all.
 *
 * ## Fixes
 * - RA-870 system-wide: DISCOUNT line items previously got TaxType="NONE" which
 *   broke Xero's expected behaviour (discounts are taxable reductions). Here they
 *   correctly return OUTPUT so Xero reduces the taxable total.
 * - GOVERNMENT_LEVY is a new category to separate statutory fees that are NOT
 *   subject to GST (e.g. council permit fees, state waste levies).
 */

/**
 * All line-item categories RestoreAssist recognises for invoicing.
 * The first 6 match the canonical categories in account-code-resolver.ts.
 * The remaining 4 cover edge-case billing classes that need distinct GST handling.
 */
export type LineItemCategory =
  | "LABOUR"
  | "EQUIPMENT"
  | "MATERIALS"
  | "SUBCONTRACTOR"
  | "PRELIMS"
  | "CONTENTS"
  | "INSURANCE_EXCESS"
  | "GOVERNMENT_LEVY"
  | "DISBURSEMENT"
  | "DISCOUNT";

export interface GstTreatment {
  /**
   * Xero-compatible tax type.
   *   OUTPUT = subject to GST at country rate (default for taxable supplies)
   *   INPUT  = input tax credit applicable (on-charged expense — disbursements)
   *   EXEMPT = GST-free supply (no tax applied)
   *   NONE   = out-of-scope of GST (use rarely — prefer EXEMPT for clarity)
   */
  taxType: "OUTPUT" | "INPUT" | "EXEMPT" | "NONE";
  /**
   * Percent rate applied, for documentation only. Actual rate computation
   * for AU/NZ regional differences should use {@link ../gst-rules#getGstTreatment}.
   */
  rate: 0 | 10;
  /** ATO reference for the classification, for audit trails. */
  atoReference: string;
}

const TAXABLE_OUTPUT: GstTreatment = {
  taxType: "OUTPUT",
  rate: 10,
  atoReference: "GSTR 2000/10 — taxable supply",
};

/**
 * Map each line item category to its GST treatment per ATO GSTR 2000/10.
 */
const TREATMENTS: Record<LineItemCategory, GstTreatment> = {
  LABOUR: TAXABLE_OUTPUT,
  EQUIPMENT: TAXABLE_OUTPUT,
  MATERIALS: TAXABLE_OUTPUT,
  SUBCONTRACTOR: TAXABLE_OUTPUT,
  PRELIMS: TAXABLE_OUTPUT,
  CONTENTS: TAXABLE_OUTPUT,

  INSURANCE_EXCESS: {
    taxType: "OUTPUT",
    rate: 10,
    atoReference:
      "GSTR 2006/10 — insurance excesses collected as consideration are taxable",
  },

  GOVERNMENT_LEVY: {
    taxType: "EXEMPT",
    rate: 0,
    atoReference:
      "ATO Div 81 — Australian taxes, fees and charges are GST-exempt",
  },

  DISBURSEMENT: {
    taxType: "INPUT",
    rate: 10,
    atoReference:
      "GSTR 2000/37 — on-charged expenses carry the supplier's GST (input credit)",
  },

  DISCOUNT: {
    // Critical: DISCOUNT is OUTPUT, NOT NONE.
    // A discount reduces the taxable supply proportionally — Xero calculates the
    // lower GST correctly only when TaxType matches the original supply.
    taxType: "OUTPUT",
    rate: 10,
    atoReference:
      "GSTR 2001/6 — settlement discounts reduce the taxable value proportionally",
  },
};

/**
 * Return the ATO-correct GST treatment for a given line-item category.
 * Unknown or null categories default to OUTPUT (safer than NONE — ensures GST
 * is applied when the category is ambiguous).
 */
export function getGSTTreatment(
  category: LineItemCategory | string | null | undefined,
): GstTreatment {
  if (!category) return TAXABLE_OUTPUT;
  const key = String(category).trim().toUpperCase() as LineItemCategory;
  return TREATMENTS[key] ?? TAXABLE_OUTPUT;
}

/**
 * Type-guard: true if the value is a known line-item category.
 * Useful for validating user input before persisting to the database.
 */
export function isKnownCategory(value: unknown): value is LineItemCategory {
  return typeof value === "string" && value in TREATMENTS;
}

/**
 * All 10 canonical categories — useful for building UI dropdowns and tests.
 */
export const ALL_CATEGORIES: readonly LineItemCategory[] = Object.keys(
  TREATMENTS,
) as LineItemCategory[];
