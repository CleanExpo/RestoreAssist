/**
 * NRPG (National Restoration Pricing Guide) Rate Ranges
 *
 * Defines hard min/max boundaries for every CompanyPricingConfig field.
 * Ranges account for Australian Fair Consumer & Business Laws using a
 * scaled approach — the all-in rate already factors in:
 *   - 50%+ labour rate increases
 *   - Administration, supervisor, and project manager allowances
 *   - 20% equipment hire markup
 *   - Cost of business supplements
 *
 * Contractors set their own pricing within these national best-practice
 * boundaries. Rates outside the range cannot be saved.
 */

export interface NRPGRateRange {
  min: number;
  max: number;
  unit: string;
  label: string;
}

export const NRPG_RATE_RANGES: Record<string, NRPGRateRange> = {
  // Labour — Master Qualified Technician
  masterQualifiedNormalHours: {
    min: 60,
    max: 170,
    unit: "$/hr",
    label: "Master Tech — Normal Hours",
  },
  masterQualifiedSaturday: {
    min: 90,
    max: 255,
    unit: "$/hr",
    label: "Master Tech — Saturday",
  },
  masterQualifiedSunday: {
    min: 120,
    max: 340,
    unit: "$/hr",
    label: "Master Tech — Sunday",
  },

  // Labour — Qualified Technician
  qualifiedTechnicianNormalHours: {
    min: 45,
    max: 130,
    unit: "$/hr",
    label: "Qualified Tech — Normal Hours",
  },
  qualifiedTechnicianSaturday: {
    min: 68,
    max: 195,
    unit: "$/hr",
    label: "Qualified Tech — Saturday",
  },
  qualifiedTechnicianSunday: {
    min: 90,
    max: 260,
    unit: "$/hr",
    label: "Qualified Tech — Sunday",
  },

  // Labour — Labourer
  labourerNormalHours: {
    min: 32,
    max: 90,
    unit: "$/hr",
    label: "Labourer — Normal Hours",
  },
  labourerSaturday: {
    min: 47,
    max: 135,
    unit: "$/hr",
    label: "Labourer — Saturday",
  },
  labourerSunday: {
    min: 63,
    max: 180,
    unit: "$/hr",
    label: "Labourer — Sunday",
  },

  // Equipment Daily Rental Rates
  airMoverAxialDailyRate: {
    min: 15,
    max: 55,
    unit: "$/day",
    label: "Air Mover (Axial)",
  },
  airMoverCentrifugalDailyRate: {
    min: 20,
    max: 75,
    unit: "$/day",
    label: "Air Mover (Centrifugal)",
  },
  dehumidifierLGRDailyRate: {
    min: 30,
    max: 100,
    unit: "$/day",
    label: "Dehumidifier (LGR)",
  },
  dehumidifierDesiccantDailyRate: {
    min: 45,
    max: 140,
    unit: "$/day",
    label: "Dehumidifier (Desiccant)",
  },
  afdUnitLargeDailyRate: {
    min: 25,
    max: 90,
    unit: "$/day",
    label: "AFD Unit (Large)",
  },
  extractionTruckMountedHourlyRate: {
    min: 80,
    max: 250,
    unit: "$/hr",
    label: "Extraction (Truck-Mounted)",
  },
  extractionElectricHourlyRate: {
    min: 55,
    max: 170,
    unit: "$/hr",
    label: "Extraction (Electric)",
  },
  injectionDryingSystemDailyRate: {
    min: 100,
    max: 320,
    unit: "$/day",
    label: "Injection Drying System",
  },

  // Chemical Treatment Rates (per m²)
  antimicrobialTreatmentRate: {
    min: 5,
    max: 18,
    unit: "$/m²",
    label: "Antimicrobial Treatment",
  },
  mouldRemediationTreatmentRate: {
    min: 10,
    max: 32,
    unit: "$/m²",
    label: "Mould Remediation Treatment",
  },
  biohazardTreatmentRate: {
    min: 17,
    max: 55,
    unit: "$/m²",
    label: "Biohazard Treatment",
  },

  // Fees
  administrationFee: {
    min: 150,
    max: 550,
    unit: "$",
    label: "Administration Fee",
  },
  callOutFee: { min: 100, max: 350, unit: "$", label: "Call-Out Fee" },
  thermalCameraUseCostPerAssessment: {
    min: 50,
    max: 165,
    unit: "$",
    label: "Thermal Camera Assessment",
  },

  // Equipment Daily Rental Rates — RA-848 additions
  negativeAirMachineDailyRate: {
    min: 55,
    max: 180,
    unit: "$/day",
    label: "Negative Air Machine",
  },
  hepaVacuumDailyRate: {
    min: 35,
    max: 90,
    unit: "$/day",
    label: "HEPA Vacuum",
  },

  // Fees — RA-848 additions
  mobilisationFee: {
    min: 100,
    max: 450,
    unit: "$",
    label: "Mobilisation Fee",
  },
  monitoringVisitDailyRate: {
    min: 85,
    max: 220,
    unit: "$/visit",
    label: "Monitoring Visit",
  },
  photoDocumentationFee: {
    min: 95,
    max: 250,
    unit: "$",
    label: "Photo Documentation Fee",
  },
  wasteDisposalPerBinRate: {
    min: 280,
    max: 650,
    unit: "$/bin",
    label: "Waste Disposal (per bin)",
  },

  // Multipliers — RA-848 additions (expressed as decimal multipliers, e.g. 1.5 = 150%)
  afterHoursMultiplier: {
    min: 1.25,
    max: 2.0,
    unit: "x",
    label: "After Hours Multiplier",
  },
  saturdayMultiplier: {
    min: 1.25,
    max: 1.75,
    unit: "x",
    label: "Saturday Multiplier",
  },
  sundayMultiplier: {
    min: 1.5,
    max: 2.25,
    unit: "x",
    label: "Sunday Multiplier",
  },
  publicHolidayMultiplier: {
    min: 2.0,
    max: 3.0,
    unit: "x",
    label: "Public Holiday Multiplier",
  },

  // Management — RA-848 additions
  projectManagementPercent: {
    min: 5.0,
    max: 15.0,
    unit: "%",
    label: "Project Management (%)",
  },
};

/** Check whether a rate value falls within the NRPG range for a given field. */
export function validateRateInRange(
  field: string,
  value: number,
): { valid: boolean; min: number; max: number; label: string } | null {
  const range = NRPG_RATE_RANGES[field];
  if (!range) return null;
  return {
    valid: value >= range.min && value <= range.max,
    min: range.min,
    max: range.max,
    label: range.label,
  };
}

/** Get the NRPG range for a specific field. */
export function getFieldRange(field: string): NRPGRateRange | undefined {
  return NRPG_RATE_RANGES[field];
}
