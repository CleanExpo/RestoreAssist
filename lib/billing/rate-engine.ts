/**
 * RateEngine — M2 Rate Infrastructure (RA-849)
 *
 * Pure rate lookup service. No DB writes. No side effects.
 *
 * Resolution priority (in order):
 *   1. CompanyPricingConfig  — user's own configured rates
 *   2. CostDatabase          — region-aware national averages
 *   3. NRPG hard-coded fallbacks — midpoint of NRPG min/max ranges
 *
 * Usage:
 *   import { lookupRate, lookupRates } from '@/lib/billing/rate-engine'
 *   const rate = await lookupRate(prisma, { userId, field: 'masterQualifiedNormalHours', region: 'QLD' })
 */

import type { PrismaClient } from '@prisma/client'
import { NRPG_RATE_RANGES } from '@/lib/nrpg-rate-ranges'

// -------------------------------------------------------
// Types
// -------------------------------------------------------

export type RateSource = 'CompanyConfig' | 'CostDatabase' | 'NRPGFallback'

export interface RateLookupResult {
  value: number
  source: RateSource
  field: string
  unit?: string
  label?: string
}

export interface RateLookupInput {
  userId: string
  field: string
  /** AU state code e.g. 'QLD', 'NSW'. Falls back to national average if not found. */
  region?: string
}

export interface MultiplierSet {
  afterHours: number
  saturday: number
  sunday: number
  publicHoliday: number
  projectManagementPercent: number
}

// -------------------------------------------------------
// NRPG Fallback Constants
// -------------------------------------------------------

/**
 * Hard-coded fallbacks for fields not covered by NRPG_RATE_RANGES
 * (multipliers and optional RA-848 equipment fields).
 * Values are NRPG national best-practice midpoints.
 */
const HARDCODED_FALLBACKS: Record<string, number> = {
  afterHoursMultiplier: 1.5,
  saturdayMultiplier: 1.5,
  sundayMultiplier: 2.0,
  publicHolidayMultiplier: 2.5,
  projectManagementPercent: 8.0,
  negativeAirMachineDailyRate: 75,
  hepaVacuumDailyRate: 60,
  monitoringVisitDailyRate: 120,
  mobilisationFee: 250,
  wasteDisposalPerBinRate: 85,
  photoDocumentationFee: 75,
}

/** Returns the NRPG midpoint for a field, or undefined if not in NRPG_RATE_RANGES. */
function nrpgMidpoint(field: string): number | undefined {
  const range = NRPG_RATE_RANGES[field]
  if (!range) return undefined
  return (range.min + range.max) / 2
}

/** Resolve the final fallback value for a field (NRPG midpoint → hardcoded → undefined). */
function resolveFallback(field: string): number | undefined {
  return nrpgMidpoint(field) ?? HARDCODED_FALLBACKS[field]
}

/** Build a RateLookupResult from an NRPG fallback. */
function nrpgResult(field: string, value: number): RateLookupResult {
  const meta = NRPG_RATE_RANGES[field]
  return { value, source: 'NRPGFallback', field, unit: meta?.unit, label: meta?.label }
}

// -------------------------------------------------------
// lookupRate — single field
// -------------------------------------------------------

/**
 * Look up a single rate field with the full priority chain.
 * Returns null only if no rate can be resolved at all.
 *
 * Two DB queries max: CompanyPricingConfig first, then CostDatabase
 * (regional, then national). NRPG fallback requires no DB access.
 */
export async function lookupRate(
  prisma: PrismaClient,
  input: RateLookupInput,
): Promise<RateLookupResult | null> {
  const { userId, field, region } = input

  // --- Priority 1: CompanyPricingConfig ---
  const config = await prisma.companyPricingConfig.findUnique({ where: { userId } })
  if (config) {
    const value = (config as Record<string, unknown>)[field]
    if (typeof value === 'number') {
      const meta = NRPG_RATE_RANGES[field]
      return { value, source: 'CompanyConfig', field, unit: meta?.unit, label: meta?.label }
    }
  }

  // --- Priority 2: CostDatabase (region-specific first, then national) ---
  if (region) {
    const regional = await prisma.costDatabase.findFirst({
      where: { itemType: field, isActive: true, region },
    })
    if (regional) {
      return { value: regional.averageRate, source: 'CostDatabase', field, unit: regional.unit, label: regional.description }
    }
  }
  const national = await prisma.costDatabase.findFirst({
    where: { itemType: field, isActive: true, region: null },
  })
  if (national) {
    return { value: national.averageRate, source: 'CostDatabase', field, unit: national.unit, label: national.description }
  }

  // --- Priority 3: NRPG fallback ---
  const fallback = resolveFallback(field)
  if (fallback !== undefined) return nrpgResult(field, fallback)

  return null
}

// -------------------------------------------------------
// lookupRates — bulk (minimises DB round-trips)
// -------------------------------------------------------

/**
 * Resolve multiple rate fields in a single pass.
 * Uses 2 DB queries total (CompanyPricingConfig + CostDatabase bulk),
 * regardless of how many fields are requested.
 * Fields that cannot be resolved are omitted from the result map.
 */
export async function lookupRates(
  prisma: PrismaClient,
  userId: string,
  fields: string[],
  region?: string,
): Promise<Record<string, RateLookupResult>> {
  const result: Record<string, RateLookupResult> = {}
  const unresolved: string[] = []

  // Priority 1 — single CompanyPricingConfig read
  const config = await prisma.companyPricingConfig.findUnique({ where: { userId } })
  for (const field of fields) {
    if (config) {
      const value = (config as Record<string, unknown>)[field]
      if (typeof value === 'number') {
        const meta = NRPG_RATE_RANGES[field]
        result[field] = { value, source: 'CompanyConfig', field, unit: meta?.unit, label: meta?.label }
        continue
      }
    }
    unresolved.push(field)
  }

  if (unresolved.length === 0) return result

  // Priority 2 — bulk CostDatabase read (regional + national in one query)
  const costRows = await prisma.costDatabase.findMany({
    where: {
      itemType: { in: unresolved },
      isActive: true,
      OR: region ? [{ region }, { region: null }] : [{ region: null }],
    },
  })

  // Build map: itemType → best row (regional preferred over national)
  const costMap = new Map<string, typeof costRows[0]>()
  for (const row of costRows) {
    const existing = costMap.get(row.itemType)
    // Regional (non-null region) beats national (null region)
    if (!existing || (row.region !== null && existing.region === null)) {
      costMap.set(row.itemType, row)
    }
  }

  for (const field of unresolved) {
    const row = costMap.get(field)
    if (row) {
      result[field] = { value: row.averageRate, source: 'CostDatabase', field, unit: row.unit, label: row.description }
      continue
    }
    // Priority 3 — NRPG fallback
    const fallback = resolveFallback(field)
    if (fallback !== undefined) result[field] = nrpgResult(field, fallback)
  }

  return result
}

// -------------------------------------------------------
// lookupMultipliers — overtime / penalty rates
// -------------------------------------------------------

/**
 * Resolve all time-of-day and penalty multipliers for a user.
 * Falls back to NRPG defaults if no CompanyPricingConfig exists.
 */
export async function lookupMultipliers(
  prisma: PrismaClient,
  userId: string,
): Promise<MultiplierSet> {
  const config = await prisma.companyPricingConfig.findUnique({
    where: { userId },
    select: {
      afterHoursMultiplier: true,
      saturdayMultiplier: true,
      sundayMultiplier: true,
      publicHolidayMultiplier: true,
      projectManagementPercent: true,
    },
  })

  return {
    afterHours:              config?.afterHoursMultiplier      ?? HARDCODED_FALLBACKS.afterHoursMultiplier,
    saturday:                config?.saturdayMultiplier         ?? HARDCODED_FALLBACKS.saturdayMultiplier,
    sunday:                  config?.sundayMultiplier           ?? HARDCODED_FALLBACKS.sundayMultiplier,
    publicHoliday:           config?.publicHolidayMultiplier    ?? HARDCODED_FALLBACKS.publicHolidayMultiplier,
    projectManagementPercent: config?.projectManagementPercent  ?? HARDCODED_FALLBACKS.projectManagementPercent,
  }
}

// -------------------------------------------------------
// Utility — pure, no DB access
// -------------------------------------------------------

/**
 * Apply a multiplier to a base rate, rounded to 2 decimal places.
 * Use for after-hours, Saturday, Sunday, and public holiday pricing.
 *
 * @example applyMultiplier(115, 1.5) → 172.50
 */
export function applyMultiplier(baseRate: number, multiplier: number): number {
  return parseFloat((baseRate * multiplier).toFixed(2))
}

/**
 * Add project management overhead to a subtotal.
 *
 * @example addProjectManagement(1000, 8.0) → 1080.00
 */
export function addProjectManagement(subtotal: number, pmPercent: number): number {
  return parseFloat((subtotal * (1 + pmPercent / 100)).toFixed(2))
}
