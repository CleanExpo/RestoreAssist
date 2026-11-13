/**
 * RA-8281 (B1): a price-list rate the contractor has not set.
 *
 * Price-list rate columns are nullable. A null rate means "rate not set": it
 * is never priced at $0 and never replaced by an NRPG midpoint or a hard-coded
 * default. Readers that cannot yet show a blocked line throw RateNotSetError
 * (or refuse the whole request) instead of producing a number.
 */
/** The 23 base rate columns that became nullable in RA-8281. */
export const BASE_RATE_FIELDS = [
  "masterQualifiedNormalHours",
  "masterQualifiedSaturday",
  "masterQualifiedSunday",
  "qualifiedTechnicianNormalHours",
  "qualifiedTechnicianSaturday",
  "qualifiedTechnicianSunday",
  "labourerNormalHours",
  "labourerSaturday",
  "labourerSunday",
  "airMoverAxialDailyRate",
  "airMoverCentrifugalDailyRate",
  "dehumidifierLGRDailyRate",
  "dehumidifierDesiccantDailyRate",
  "afdUnitLargeDailyRate",
  "extractionTruckMountedHourlyRate",
  "extractionElectricHourlyRate",
  "injectionDryingSystemDailyRate",
  "antimicrobialTreatmentRate",
  "mouldRemediationTreatmentRate",
  "biohazardTreatmentRate",
  "administrationFee",
  "callOutFee",
  "thermalCameraUseCostPerAssessment",
] as const;

export type BaseRateField = (typeof BASE_RATE_FIELDS)[number];

export interface UnsetRate {
  field: string;
  /** "Rate not set. Set <field> in your price list." Never a range figure. */
  note: string;
}

/** True when a stored rate value counts as set (a finite number). */
function isSet(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** A price list, or none at all (every rate then reads as unset). */
type PriceList = object | null | undefined;

/**
 * What every unset rate reads, on every surface. It names the price-list
 * field and nothing else: the NRPG national range is never shown to a
 * contractor (founder rule, 2026-11-12), so this file does not read it.
 */
export function rateNotSetNote(field: string): string {
  return `Rate not set. Set ${field} in your price list.`;
}

export class RateNotSetError extends Error {
  readonly unset: UnsetRate[];
  constructor(unset: UnsetRate[]) {
    super(unset.map((u) => u.note).join(" "));
    this.name = "RateNotSetError";
    this.unset = unset;
  }
}

/** The fields among `fields` that the price list leaves unset. */
export function unsetRates(
  config: PriceList,
  fields: readonly string[],
): UnsetRate[] {
  const row = (config ?? {}) as Record<string, unknown>;
  return fields
    .filter((f) => !isSet(row[f]))
    .map((f) => ({ field: f, note: rateNotSetNote(f) }));
}

/** The rate for `field`, or a RateNotSetError. Never 0, never a default. */
export function requireRate(config: PriceList, field: string): number {
  const value = ((config ?? {}) as Record<string, unknown>)[field];
  if (isSet(value)) return value;
  throw new RateNotSetError([{ field, note: rateNotSetNote(field) }]);
}

/** Throws RateNotSetError when any of `fields` is unset. */
export function assertRatesSet(
  config: PriceList,
  fields: readonly string[],
): void {
  const unset = unsetRates(config, fields);
  if (unset.length > 0) throw new RateNotSetError(unset);
}
