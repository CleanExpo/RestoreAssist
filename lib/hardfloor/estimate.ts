/**
 * Hard Floor add-on — estimate and quote options.
 *
 * Rates are organisation-supplied (no built-in dollar figures). GST comes
 * from `lib/gst-rules.ts`, the single source of truth for AU 10% / NZ 15%.
 * All money is integer cents.
 */

import { computeGstCents, type Country } from "@/lib/gst-rules";
import { isServiceAllowed } from "./sop-library";
import type { FloorType, ServiceType } from "./types";

export interface EstimateRoom {
  name: string;
  floorType: FloorType;
  service: ServiceType;
  areaM2: number;
}

export interface RateCard {
  /** Cents per square metre, per service. */
  perM2Cents: Partial<Record<ServiceType, number>>;
  /** Cents per linear metre of hand-detailed edges. */
  edgePerMCents?: number;
  /** Cents per furniture move. */
  furnitureMoveCents?: number;
}

export interface EstimateInput {
  rooms: readonly EstimateRoom[];
  rateCard: RateCard;
  edgeLinearM?: number;
  furnitureMoves?: number;
  country: Country;
}

export interface EstimateLine {
  description: string;
  quantity: number;
  unit: "m2" | "m" | "each";
  unitCents: number;
  totalCents: number;
}

export interface Estimate {
  lines: EstimateLine[];
  subtotalCents: number;
  gstCents: number;
  totalCents: number;
  country: Country;
}

function assertNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number`);
  }
}

export function estimateJob(input: EstimateInput): Estimate {
  if (input.rooms.length === 0) throw new Error("An estimate needs at least one room");
  const lines: EstimateLine[] = [];

  for (const room of input.rooms) {
    assertNonNegative(room.areaM2, `Area for ${room.name}`);
    if (!isServiceAllowed(room.floorType, room.service)) {
      throw new Error(`${room.service} is not a valid service for ${room.floorType} (${room.name})`);
    }
    const rate = input.rateCard.perM2Cents[room.service];
    if (rate === undefined) throw new Error(`No rate set for ${room.service}`);
    assertNonNegative(rate, `Rate for ${room.service}`);
    lines.push({
      description: `${room.name}: ${room.service.replace(/_/g, " ")}`,
      quantity: room.areaM2,
      unit: "m2",
      unitCents: rate,
      totalCents: Math.round(room.areaM2 * rate),
    });
  }

  if (input.edgeLinearM && input.edgeLinearM > 0) {
    const rate = input.rateCard.edgePerMCents;
    if (rate === undefined) throw new Error("No rate set for edge detailing");
    assertNonNegative(rate, "Edge rate");
    lines.push({
      description: "Edge detailing",
      quantity: input.edgeLinearM,
      unit: "m",
      unitCents: rate,
      totalCents: Math.round(input.edgeLinearM * rate),
    });
  }

  if (input.furnitureMoves && input.furnitureMoves > 0) {
    const rate = input.rateCard.furnitureMoveCents;
    if (rate === undefined) throw new Error("No rate set for furniture moves");
    assertNonNegative(rate, "Furniture move rate");
    lines.push({
      description: "Furniture moves",
      quantity: input.furnitureMoves,
      unit: "each",
      unitCents: rate,
      totalCents: input.furnitureMoves * rate,
    });
  }

  const subtotalCents = lines.reduce((sum, l) => sum + l.totalCents, 0);
  const gstCents = computeGstCents(subtotalCents, input.country);
  return { lines, subtotalCents, gstCents, totalCents: subtotalCents + gstCents, country: input.country };
}

export type QuoteOptionKey = "clean" | "clean_protect" | "restore_plan";

export interface QuoteOption {
  key: QuoteOptionKey;
  label: string;
  estimate: Estimate;
  includesMaintenancePlan: boolean;
}

const OPTION_LABELS: Record<QuoteOptionKey, string> = {
  clean: "Clean",
  clean_protect: "Clean and protect",
  restore_plan: "Restore plus maintenance plan",
};

/** The three-option quote sent for e-sign (step 7). */
export function buildQuoteOptions(
  estimates: Readonly<Record<QuoteOptionKey, Estimate>>,
): QuoteOption[] {
  return (["clean", "clean_protect", "restore_plan"] as const).map((key) => ({
    key,
    label: OPTION_LABELS[key],
    estimate: estimates[key],
    includesMaintenancePlan: key === "restore_plan",
  }));
}
