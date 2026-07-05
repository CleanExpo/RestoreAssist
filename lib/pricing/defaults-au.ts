import type { AbrEntityType } from '@/lib/integrations/abr/parse';

export const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'] as const;
export type AuState = (typeof AU_STATES)[number];

export interface PricingDefaults {
  // Labour (per hour, AUD)
  masterQualifiedNormalHours: number;
  qualifiedTechnicianNormalHours: number;
  labourerNormalHours: number;
  // Multipliers
  saturdayMultiplier: number;
  sundayMultiplier: number;
  afterHoursMultiplier: number;
  publicHolidayMultiplier: number;
  // Equipment (per day, AUD)
  airMoverAxialPerDay: number;
  airMoverCentrifugalPerDay: number;
  dehumidifierLgrPerDay: number;
  dehumidifierDesiccantPerDay: number;
  afdNegativeAirPerDay: number;
  hepaVacuumPerDay: number;
  // Fees
  administrationFee: number;
  callOutFee: number;
  mobilisationFee: number;
  thermalCameraUseCostPerAssessment: number;
  // Chemical treatments (per sqm, AUD)
  antimicrobialTreatmentRate: number;
  mouldRemediationTreatmentRate: number;
  // Other
  projectManagementPercent: number;
}

// IICRC industry medians (2025 dataset; adjust as needed)
const NATIONAL_MEDIAN: PricingDefaults = {
  masterQualifiedNormalHours: 165,
  qualifiedTechnicianNormalHours: 125,
  labourerNormalHours: 85,
  saturdayMultiplier: 1.5,
  sundayMultiplier: 2.0,
  afterHoursMultiplier: 1.5,
  publicHolidayMultiplier: 2.5,
  airMoverAxialPerDay: 65,
  airMoverCentrifugalPerDay: 85,
  dehumidifierLgrPerDay: 195,
  dehumidifierDesiccantPerDay: 425,
  afdNegativeAirPerDay: 215,
  hepaVacuumPerDay: 95,
  administrationFee: 165,
  callOutFee: 245,
  mobilisationFee: 185,
  thermalCameraUseCostPerAssessment: 145,
  antimicrobialTreatmentRate: 18,
  // RA-7001: floor of the NRPG $65-145/m² range (founder-approved 2026-07-06).
  mouldRemediationTreatmentRate: 65,
  projectManagementPercent: 8,
};

const STATE_ADJUSTMENT: Record<AuState, number> = {
  NSW: 1.08,
  VIC: 1.05,
  QLD: 1.02,
  WA: 1.10,
  SA: 0.95,
  TAS: 0.92,
  ACT: 1.06,
  NT: 1.15,
};

const ENTITY_TYPE_ADJUSTMENT: Record<AbrEntityType, number> = {
  SOLE_TRADER: 0.95,
  PARTNERSHIP: 0.98,
  COMPANY: 1.05,
  TRUST: 1.00,
  OTHER: 1.00,
};

// Dimensionless rate multipliers — not scaled by state/entity adjustments
const PASSTHROUGH = new Set([
  'saturdayMultiplier',
  'sundayMultiplier',
  'afterHoursMultiplier',
  'publicHolidayMultiplier',
  'projectManagementPercent',
]);

export function getDefaultPricing(input: {
  state: AuState | string;
  entityType: AbrEntityType;
}): PricingDefaults {
  const stateMul = STATE_ADJUSTMENT[input.state as AuState] ?? 1.0;
  const entityMul = ENTITY_TYPE_ADJUSTMENT[input.entityType] ?? 1.0;
  const mul = stateMul * entityMul;

  const result = { ...NATIONAL_MEDIAN };
  for (const k of Object.keys(NATIONAL_MEDIAN) as Array<keyof PricingDefaults>) {
    if (PASSTHROUGH.has(k)) continue;
    result[k] = Math.round((NATIONAL_MEDIAN[k] as number) * mul);
  }
  return result;
}
