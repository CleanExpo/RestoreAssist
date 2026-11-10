/**
 * RA-8281 — price an assessment scope from the contractor's own price list.
 *
 * The water, mould, storm, biohazard, HVAC and Australian-compliance domains
 * used hard-coded "default" rates and priced any line without a rate at $0,
 * so a total could look complete while a rate was missing. Here each line
 * names the price-list field it is priced from:
 *
 *   - field set and inside its NRPG national range -> priced
 *   - field not set          -> "Rate not set ... (national range $X-$Y)"
 *   - field outside range    -> rate out of range
 *   - no field for this line -> needs a price-list field
 *   - no usable quantity     -> quantity needed
 *
 * Any unpriced line blocks the total (totals are null, never a partial sum
 * and never $0). Reads and totals go through lib/scope-fire (readRate,
 * priceFireScope) so every domain shares one pricing rule (RA-8275).
 */

import type { GstTreatment } from "@/lib/gst-rules";
import { getFieldRange } from "@/lib/nrpg-rate-ranges";
import {
  priceFireScope,
  readRate,
  type FirePricingConfig,
  type ScopeItemDraft,
} from "@/lib/scope-fire";
import type { AssessmentEstimate, ScopeCategory } from "./types";

export const NO_PRICE_LIST_FIELD_NOTE =
  "No price-list field exists for this item yet, so it cannot be priced from your rates.";

export const QUANTITY_NEEDED_NOTE = "Quantity needed from the inspection.";

export interface PriceListLine {
  description: string;
  category: ScopeCategory;
  quantity: number | null | undefined;
  unit: string;
  /** The contractor price-list field this line is priced from, if any. */
  rateField?: string;
}

/**
 * The line units each NRPG rate unit can price. A rate is only multiplied by
 * a quantity measured in the same unit: an hourly rate never prices square
 * metres, and a daily hire rate never prices a once-per-job line (RA-8281
 * review). A rate unit missing here prices nothing.
 */
const LINE_UNITS_BY_RATE_UNIT: Record<string, readonly string[]> = {
  "$/m²": ["m²"],
  "$/day": ["day", "unit·day"],
  "$/hr": ["hr"],
  "$/visit": ["visit"],
  $: ["job"],
};

export function unitMatchesField(lineUnit: string, field: string): boolean {
  const range = getFieldRange(field);
  // No NRPG range: the field's unit is not recorded, so it cannot be checked.
  if (!range) return true;
  return (LINE_UNITS_BY_RATE_UNIT[range.unit] ?? []).includes(lineUnit);
}

function unitMismatchNote(lineUnit: string, field: string): string {
  const rateUnit = getFieldRange(field)?.unit ?? "";
  const per = rateUnit.startsWith("$/")
    ? `per ${rateUnit.slice(2)}`
    : "as a flat fee";
  return `Your ${field} is priced ${per}, but this line is measured in ${lineUnit}. It needs its own price-list field.`;
}

function usableQuantity(q: number | null | undefined): number | undefined {
  return typeof q === "number" && Number.isFinite(q) && q > 0 ? q : undefined;
}

function toDraft(
  line: PriceListLine,
  config: FirePricingConfig,
): ScopeItemDraft {
  const quantity = usableQuantity(line.quantity);
  const base: ScopeItemDraft = {
    itemType: line.category,
    description: line.description,
    justification: "",
    iicrcReference: "",
    quantity,
    unit: line.unit,
    isRequired: true,
    rateField: line.rateField,
  };
  if (!line.rateField) {
    return {
      ...base,
      pricingStatus: "needs_price_list_field",
      pricingNote: NO_PRICE_LIST_FIELD_NOTE,
    };
  }
  if (!unitMatchesField(line.unit, line.rateField)) {
    return {
      ...base,
      pricingStatus: "needs_price_list_field",
      pricingNote: unitMismatchNote(line.unit, line.rateField),
    };
  }
  const read = readRate(config, line.rateField);
  if (read.status !== "priced") {
    return { ...base, pricingStatus: read.status, pricingNote: read.note };
  }
  if (quantity === undefined) {
    return {
      ...base,
      pricingStatus: "quantity_needed",
      pricingNote: QUANTITY_NEEDED_NOTE,
    };
  }
  return { ...base, pricingStatus: "priced", unitCostAud: read.rate };
}

/**
 * Build an assessment estimate from the contractor's price list. `config`
 * is the resolved OrganizationPricingConfig / CompanyPricingConfig row, or
 * null when the contractor has none (every line then reads "rate not set").
 */
export function estimateFromPriceList(
  lines: PriceListLine[],
  config: FirePricingConfig | null | undefined,
  gst: GstTreatment,
): AssessmentEstimate {
  const priced = priceFireScope(
    lines.map((l) => toDraft(l, config ?? {})),
    gst,
  );
  return {
    lines: priced.lines.map((l, i) => ({
      description: l.description,
      category: lines[i].category,
      quantity: l.quantity,
      unit: l.unit ?? lines[i].unit,
      rate: l.rate,
      lineTotalExGst: l.lineTotalExGst,
      gstAmount: l.gstAmount,
      lineTotalIncGst: l.lineTotalIncGst,
      pricingStatus: l.pricingStatus,
      pricingNote: l.pricingNote,
    })),
    totals: {
      subtotalExGst: priced.subtotalExGst,
      gstTotal: priced.gstTotal,
      totalIncGst: priced.totalIncGst,
      gstRate: priced.gstRate,
      currency: priced.currency,
      status: priced.status,
      missing: priced.missing.map((m) => ({
        description: m.description,
        note: m.note,
      })),
      basis: priced.basis,
    },
  };
}
