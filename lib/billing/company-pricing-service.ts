/**
 * CompanyPricingService — M2 Rate Infrastructure (RA-849)
 *
 * CRUD wrapper for CompanyPricingConfig with NRPG range validation.
 * Ensures all stored rates fall within NRPG national best-practice boundaries.
 *
 * Usage:
 *   import { getOrCreateConfig, updateConfig } from '@/lib/billing/company-pricing-service'
 *   const config = await getOrCreateConfig(prisma, userId)
 */

import type { PrismaClient, CompanyPricingConfig } from '@prisma/client'
import { NRPG_RATE_RANGES, validateRateInRange } from '@/lib/nrpg-rate-ranges'

// -------------------------------------------------------
// Types
// -------------------------------------------------------

/**
 * Fields accepted in create/update operations.
 * Excludes system-managed fields (id, userId, timestamps).
 */
export type PricingConfigInput = Omit<
  CompanyPricingConfig,
  'id' | 'userId' | 'createdAt' | 'updatedAt'
>

export type PricingConfigUpdateInput = Partial<PricingConfigInput>

export interface ValidationError {
  field: string
  message: string
  value: number
  min: number
  max: number
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

export interface UpdateResult {
  config: CompanyPricingConfig
  validation: ValidationResult
}

// -------------------------------------------------------
// NRPG Default Rates
// -------------------------------------------------------

/** Midpoint of a NRPG min/max range. Returns 0 if field not in NRPG_RATE_RANGES. */
function mid(field: string): number {
  const r = NRPG_RATE_RANGES[field]
  return r ? (r.min + r.max) / 2 : 0
}

/**
 * Returns NRPG midpoint values for all CompanyPricingConfig fields.
 * Used when creating a new config and as a reset target.
 */
export function getNRPGDefaults(): PricingConfigInput {
  return {
    // Labour — Master Qualified Technician
    masterQualifiedNormalHours: mid('masterQualifiedNormalHours'),
    masterQualifiedSaturday:    mid('masterQualifiedSaturday'),
    masterQualifiedSunday:      mid('masterQualifiedSunday'),

    // Labour — Qualified Technician
    qualifiedTechnicianNormalHours: mid('qualifiedTechnicianNormalHours'),
    qualifiedTechnicianSaturday:    mid('qualifiedTechnicianSaturday'),
    qualifiedTechnicianSunday:      mid('qualifiedTechnicianSunday'),

    // Labour — Labourer
    labourerNormalHours: mid('labourerNormalHours'),
    labourerSaturday:    mid('labourerSaturday'),
    labourerSunday:      mid('labourerSunday'),

    // Equipment Daily Rental Rates
    airMoverAxialDailyRate:           mid('airMoverAxialDailyRate'),
    airMoverCentrifugalDailyRate:     mid('airMoverCentrifugalDailyRate'),
    dehumidifierLGRDailyRate:         mid('dehumidifierLGRDailyRate'),
    dehumidifierDesiccantDailyRate:   mid('dehumidifierDesiccantDailyRate'),
    afdUnitLargeDailyRate:            mid('afdUnitLargeDailyRate'),
    extractionTruckMountedHourlyRate: mid('extractionTruckMountedHourlyRate'),
    extractionElectricHourlyRate:     mid('extractionElectricHourlyRate'),
    injectionDryingSystemDailyRate:   mid('injectionDryingSystemDailyRate'),

    // Chemical Treatment Rates
    antimicrobialTreatmentRate:    mid('antimicrobialTreatmentRate'),
    mouldRemediationTreatmentRate: mid('mouldRemediationTreatmentRate'),
    biohazardTreatmentRate:        mid('biohazardTreatmentRate'),

    // Fees
    administrationFee:                 mid('administrationFee'),
    callOutFee:                        mid('callOutFee'),
    thermalCameraUseCostPerAssessment: mid('thermalCameraUseCostPerAssessment'),

    // Custom JSON fields
    customFields: null,

    // RA-848 optional equipment rates (null = not yet configured)
    negativeAirMachineDailyRate: null,
    hepaVacuumDailyRate:         null,
    monitoringVisitDailyRate:    null,
    mobilisationFee:             null,
    wasteDisposalPerBinRate:     null,
    photoDocumentationFee:       null,

    // RA-848 multipliers (NRPG standard defaults)
    afterHoursMultiplier:      1.5,
    saturdayMultiplier:        1.5,
    sundayMultiplier:          2.0,
    publicHolidayMultiplier:   2.5,
    projectManagementPercent:  8.0,
  }
}

// -------------------------------------------------------
// Validation
// -------------------------------------------------------

/**
 * Validate all numeric fields in an update payload against NRPG ranges.
 * Only fields present in NRPG_RATE_RANGES are range-checked.
 * null / undefined values and non-numeric fields are skipped.
 */
export function validatePricingConfig(data: PricingConfigUpdateInput): ValidationResult {
  const errors: ValidationError[] = []

  for (const [field, value] of Object.entries(data)) {
    if (value === null || value === undefined || typeof value !== 'number') continue

    const check = validateRateInRange(field, value)
    if (check && !check.valid) {
      errors.push({
        field,
        message: `${check.label}: ${value} is outside the NRPG range (${check.min}–${check.max})`,
        value,
        min: check.min,
        max: check.max,
      })
    }
  }

  return { valid: errors.length === 0, errors }
}

// -------------------------------------------------------
// Service Functions
// -------------------------------------------------------

/**
 * Get a user's pricing config.
 * If none exists, creates one seeded with NRPG midpoint defaults.
 * Safe to call on every estimate — idempotent.
 */
export async function getOrCreateConfig(
  prisma: PrismaClient,
  userId: string,
): Promise<CompanyPricingConfig> {
  const existing = await prisma.companyPricingConfig.findUnique({ where: { userId } })
  if (existing) return existing

  return prisma.companyPricingConfig.create({
    data: { userId, ...getNRPGDefaults() },
  })
}

/**
 * Get a user's pricing config without auto-creating.
 * Returns null if the user has not yet configured pricing.
 */
export async function getConfig(
  prisma: PrismaClient,
  userId: string,
): Promise<CompanyPricingConfig | null> {
  return prisma.companyPricingConfig.findUnique({ where: { userId } })
}

/**
 * Update (or create) a user's pricing config.
 * Validates all numeric fields against NRPG ranges before writing.
 * Throws an Error with a field-by-field breakdown if validation fails.
 */
export async function updateConfig(
  prisma: PrismaClient,
  userId: string,
  data: PricingConfigUpdateInput,
): Promise<UpdateResult> {
  const validation = validatePricingConfig(data)

  if (!validation.valid) {
    const detail = validation.errors.map((e) => `  • ${e.message}`).join('\n')
    throw new Error(`NRPG validation failed for userId=${userId}:\n${detail}`)
  }

  const config = await prisma.companyPricingConfig.upsert({
    where:  { userId },
    update: data,
    create: { userId, ...getNRPGDefaults(), ...data },
  })

  return { config, validation }
}

/**
 * Reset a user's pricing config to NRPG midpoint defaults.
 * Useful for "Restore defaults" UI action.
 */
export async function resetToDefaults(
  prisma: PrismaClient,
  userId: string,
): Promise<CompanyPricingConfig> {
  return prisma.companyPricingConfig.upsert({
    where:  { userId },
    update: getNRPGDefaults(),
    create: { userId, ...getNRPGDefaults() },
  })
}

/**
 * Return a human-readable summary of all configured rates for a user.
 * Returns null if no config exists yet.
 * Useful for audit logs and UI display.
 */
export async function getRatesSummary(
  prisma: PrismaClient,
  userId: string,
): Promise<{ field: string; value: number; unit: string; label: string; inRange: boolean }[] | null> {
  const config = await prisma.companyPricingConfig.findUnique({ where: { userId } })
  if (!config) return null

  return Object.entries(NRPG_RATE_RANGES).map(([field, meta]) => {
    const value = (config as Record<string, unknown>)[field]
    const numValue = typeof value === 'number' ? value : 0
    const check = validateRateInRange(field, numValue)
    return {
      field,
      value:   numValue,
      unit:    meta.unit,
      label:   meta.label,
      inRange: check?.valid ?? true,
    }
  })
}
