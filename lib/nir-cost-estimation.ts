/**
 * NIR Cost Estimation Engine
 *
 * Calculates restoration costs from scope items using the company's saved
 * pricing configuration as the primary rate source. Falls back to NRPG
 * midpoints when no config exists.
 *
 * Rate hierarchy (highest priority first):
 *   1. Company's CompanyPricingConfig (client-set, NRPG-validated at save time)
 *   2. NRPG midpoint — (min + max) / 2 from nrpg-rate-ranges.ts
 *
 * Every estimate item reports its NRPG compliance status so the adjuster
 * and insurer can verify rates are within national guidelines.
 *
 * Unit conventions (Australian):
 *   Area     — m²  (not sq ft)
 *   Currency — AUD (not USD)
 *   Rates    — as per NRPG_RATE_RANGES units ($/hr, $/day, $/m², $)
 */

import { prisma } from '@/lib/prisma'
import {
  NRPG_RATE_RANGES,
  validateRateInRange,
  type NRPGRateRange,
} from '@/lib/nrpg-rate-ranges'

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface CostEstimateItem {
  scopeItemId?: string
  category: 'Labour' | 'Equipment' | 'Materials' | 'Other'
  description: string
  quantity: number
  unit: string
  rate: number
  subtotal: number
  /** The NRPG rate field this item maps to, if one exists */
  nrpgField: string | null
  /** Whether this item's rate falls within NRPG guidelines */
  nrpgCompliant: boolean
  /** NRPG min/max for adjuster reference (null if no NRPG field) */
  nrpgRange: { min: number; max: number; unit: string } | null
  /** Where the rate came from */
  rateSource: 'company-config' | 'nrpg-midpoint'
  costDatabaseId?: string
  isEstimated: boolean
}

export interface NRPGViolation {
  scopeItemDescription: string
  nrpgField: string
  rate: number
  min: number
  max: number
  label: string
}

export interface CostEstimateResult {
  items: CostEstimateItem[]
  subtotal: number
  contingency: number
  contingencyPercentage: number
  total: number
  currency: 'AUD'
  breakdown: {
    equipment: number
    labour: number
    materials: number
    other: number
  }
  /** true if all items with NRPG fields are within their ranges */
  nrpgCompliant: boolean
  /** Any items whose rates fall outside NRPG guidelines */
  nrpgViolations: NRPGViolation[]
  /** Where rates were sourced from for this estimate */
  pricingSource: 'company-config' | 'nrpg-midpoint' | 'mixed'
}

/** Subset of CompanyPricingConfig fields used by the estimation engine */
export interface CompanyPricingRates {
  masterQualifiedNormalHours:       number
  qualifiedTechnicianNormalHours:   number
  labourerNormalHours:              number
  airMoverAxialDailyRate:           number
  airMoverCentrifugalDailyRate:     number
  dehumidifierLGRDailyRate:         number
  dehumidifierDesiccantDailyRate:   number
  afdUnitLargeDailyRate:            number
  extractionTruckMountedHourlyRate: number
  extractionElectricHourlyRate:     number
  injectionDryingSystemDailyRate:   number
  antimicrobialTreatmentRate:       number
  mouldRemediationTreatmentRate:    number
  biohazardTreatmentRate:           number
  administrationFee:                number
  callOutFee:                       number
  thermalCameraUseCostPerAssessment:number
}

// ─── SCOPE → NRPG MAPPING ────────────────────────────────────────────────────

/**
 * Maps each scope item type to:
 *   - nrpgField   — the CompanyPricingConfig / NRPG_RATE_RANGES key (null = market rate)
 *   - defaultRate — NRPG midpoint in AUD (used when no company config exists)
 *   - unit        — Australian unit for this item type
 *   - category    — cost category for breakdown
 *
 * Items with nrpgField: null are market composites (e.g. per-m² labour rates
 * that bundle labour + overhead). They are NRPG-aware in spirit but don't
 * map to a single rate field — they are flagged as nrpgCompliant: true by
 * convention since no single NRPG boundary governs them.
 */
interface ScopeItemNRPGConfig {
  nrpgField: keyof CompanyPricingRates | null
  defaultRate: number
  unit: string
  category: CostEstimateItem['category']
}

const SCOPE_ITEM_NRPG_CONFIG: Record<string, ScopeItemNRPGConfig> = {
  // ── Equipment (daily rental) ───────────────────────────────────────────────
  install_dehumidification: {
    nrpgField:   'dehumidifierLGRDailyRate',
    defaultRate: midpoint('dehumidifierLGRDailyRate'),
    unit:        'day',
    category:    'Equipment',
  },
  install_air_movers: {
    nrpgField:   'airMoverAxialDailyRate',
    defaultRate: midpoint('airMoverAxialDailyRate'),
    unit:        'day',
    category:    'Equipment',
  },
  dry_out_structure: {
    nrpgField:   'injectionDryingSystemDailyRate',
    defaultRate: midpoint('injectionDryingSystemDailyRate'),
    unit:        'day',
    category:    'Equipment',
  },

  // ── Labour (hourly extraction) ─────────────────────────────────────────────
  extract_standing_water: {
    nrpgField:   'extractionElectricHourlyRate',
    defaultRate: midpoint('extractionElectricHourlyRate'),
    unit:        'hr',
    category:    'Labour',
  },
  extract_standing_water_truck: {
    nrpgField:   'extractionTruckMountedHourlyRate',
    defaultRate: midpoint('extractionTruckMountedHourlyRate'),
    unit:        'hr',
    category:    'Labour',
  },

  // ── Labour (per m² composites — no single NRPG field, AUD midpoints) ───────
  remove_carpet: {
    nrpgField:   null,    // composite: labourer rate × ~0.25hr/m² + disposal
    defaultRate: 22,      // AUD/m² — mid-market AU rate
    unit:        'm²',
    category:    'Labour',
  },
  demolish_drywall: {
    nrpgField:   null,    // composite: labourer rate × ~0.3hr/m² + disposal
    defaultRate: 28,      // AUD/m²
    unit:        'm²',
    category:    'Labour',
  },
  containment_setup: {
    nrpgField:   null,    // composite: labourer hours + materials (poly sheeting etc.)
    defaultRate: 350,     // AUD/job — mid-market for standard containment
    unit:        'job',
    category:    'Labour',
  },

  // ── Materials (per m² chemical treatment) ─────────────────────────────────
  apply_antimicrobial: {
    nrpgField:   'antimicrobialTreatmentRate',
    defaultRate: midpoint('antimicrobialTreatmentRate'),
    unit:        'm²',
    category:    'Materials',
  },
  sanitize_materials: {
    nrpgField:   'antimicrobialTreatmentRate',
    defaultRate: midpoint('antimicrobialTreatmentRate'),
    unit:        'm²',
    category:    'Materials',
  },
  mould_treatment: {
    nrpgField:   'mouldRemediationTreatmentRate',
    defaultRate: midpoint('mouldRemediationTreatmentRate'),
    unit:        'm²',
    category:    'Materials',
  },
  biohazard_treatment: {
    nrpgField:   'biohazardTreatmentRate',
    defaultRate: midpoint('biohazardTreatmentRate'),
    unit:        'm²',
    category:    'Materials',
  },
  ppe_required: {
    nrpgField:   null,    // consumable — included in NRPG labour rate by convention
    defaultRate: 100,     // AUD/job
    unit:        'job',
    category:    'Materials',
  },

  // ── Fees ──────────────────────────────────────────────────────────────────
  administration_fee: {
    nrpgField:   'administrationFee',
    defaultRate: midpoint('administrationFee'),
    unit:        '$',
    category:    'Other',
  },
  call_out_fee: {
    nrpgField:   'callOutFee',
    defaultRate: midpoint('callOutFee'),
    unit:        '$',
    category:    'Other',
  },
  thermal_camera_assessment: {
    nrpgField:   'thermalCameraUseCostPerAssessment',
    defaultRate: midpoint('thermalCameraUseCostPerAssessment'),
    unit:        'assessment',
    category:    'Other',
  },

  // ── Third-party testing (no NRPG boundary — external provider costs) ───────
  // Australian English: mould_testing (scope engine emits this item type)
  mould_testing: {
    nrpgField:   null,
    defaultRate: 300,
    unit:        'test',
    category:    'Other',
  },
  /** @deprecated Use mould_testing. Kept temporarily for any legacy records. */
  mold_testing: {
    nrpgField:   null,
    defaultRate: 300,
    unit:        'test',
    category:    'Other',
  },
  asbestos_assessment: {
    nrpgField:   null,
    defaultRate: 450,
    unit:        'assessment',
    category:    'Other',
  },
  lead_assessment: {
    nrpgField:   null,
    defaultRate: 375,
    unit:        'assessment',
    category:    'Other',
  },
}

/** Return the midpoint of an NRPG range. Used for fallback default rates. */
function midpoint(field: keyof typeof NRPG_RATE_RANGES): number {
  const r = NRPG_RATE_RANGES[field]
  return Math.round(((r.min + r.max) / 2) * 100) / 100
}

// ─── MAIN ESTIMATION FUNCTION ─────────────────────────────────────────────────

interface ScopeItemInput {
  itemType: string
  description: string
  quantity?: number | null
  unit?: string | null
  specification?: string | null
  justification?: string | null
}

/**
 * Estimate costs for scope items.
 *
 * @param scopeItems   — scope items produced by nir-scope-determination.ts
 * @param region       — AU state code (e.g. 'QLD') for future regional adjustments
 * @param pricingRates — company's saved pricing config; if omitted, fetched by userId or falls back to NRPG midpoints
 * @param userId       — fetches company pricing config from DB when pricingRates not provided
 */
export async function estimateCosts(
  scopeItems: ScopeItemInput[],
  region?: string | null,
  pricingRates?: CompanyPricingRates | null,
  userId?: string | null
): Promise<CostEstimateResult> {

  // ── Load company pricing config ──────────────────────────────────────────
  let rates: CompanyPricingRates | null = pricingRates ?? null

  if (!rates && userId) {
    rates = await fetchCompanyRates(userId)
  }

  const pricingSourceTracker = new Set<'company-config' | 'nrpg-midpoint'>()

  // ── Build estimate items ──────────────────────────────────────────────────
  const items: CostEstimateItem[] = []

  for (const scopeItem of scopeItems) {
    const item = buildEstimateItem(scopeItem, rates, pricingSourceTracker)
    if (item) items.push(item)
  }

  // ── Aggregate ─────────────────────────────────────────────────────────────
  const subtotal = items.reduce((s, i) => s + i.subtotal, 0)

  const breakdown = {
    equipment: items.filter(i => i.category === 'Equipment').reduce((s, i) => s + i.subtotal, 0),
    labour:    items.filter(i => i.category === 'Labour').reduce((s, i) => s + i.subtotal, 0),
    materials: items.filter(i => i.category === 'Materials').reduce((s, i) => s + i.subtotal, 0),
    other:     items.filter(i => i.category === 'Other').reduce((s, i) => s + i.subtotal, 0),
  }

  const contingencyPercentage = calculateContingencyPercentage(scopeItems)
  const contingency = Math.round(subtotal * (contingencyPercentage / 100) * 100) / 100
  const total = Math.round((subtotal + contingency) * 100) / 100

  // ── NRPG compliance rollup ────────────────────────────────────────────────
  const nrpgViolations: NRPGViolation[] = items
    .filter(i => !i.nrpgCompliant && i.nrpgField && i.nrpgRange)
    .map(i => ({
      scopeItemDescription: i.description,
      nrpgField:            i.nrpgField!,
      rate:                 i.rate,
      min:                  i.nrpgRange!.min,
      max:                  i.nrpgRange!.max,
      label:                NRPG_RATE_RANGES[i.nrpgField!]?.label ?? i.nrpgField!,
    }))

  const nrpgCompliant = nrpgViolations.length === 0

  const sources = Array.from(pricingSourceTracker)
  const pricingSource: CostEstimateResult['pricingSource'] =
    sources.length === 2 ? 'mixed'
    : sources[0] ?? 'nrpg-midpoint'

  return {
    items,
    subtotal: Math.round(subtotal * 100) / 100,
    contingency,
    contingencyPercentage,
    total,
    currency: 'AUD',
    breakdown,
    nrpgCompliant,
    nrpgViolations,
    pricingSource,
  }
}

// ─── ITEM BUILDER ─────────────────────────────────────────────────────────────

function buildEstimateItem(
  scopeItem: ScopeItemInput,
  rates: CompanyPricingRates | null,
  pricingSourceTracker: Set<'company-config' | 'nrpg-midpoint'>
): CostEstimateItem | null {
  const config = SCOPE_ITEM_NRPG_CONFIG[scopeItem.itemType]

  if (!config) {
    // Unknown scope item type — skip silently
    // In production: log to observability for SCOPE_ITEM_NRPG_CONFIG expansion
    return null
  }

  // ── Determine rate ───────────────────────────────────────────────────────
  let rate: number
  let rateSource: 'company-config' | 'nrpg-midpoint'

  if (rates && config.nrpgField && rates[config.nrpgField] != null) {
    rate = rates[config.nrpgField] as number
    rateSource = 'company-config'
  } else {
    rate = config.defaultRate
    rateSource = 'nrpg-midpoint'
  }

  pricingSourceTracker.add(rateSource)

  // ── Determine quantity ──────────────────────────────────────────────────
  const quantity = resolveQuantity(scopeItem, config)

  // ── NRPG compliance check ────────────────────────────────────────────────
  let nrpgCompliant = true
  let nrpgRange: CostEstimateItem['nrpgRange'] = null

  if (config.nrpgField) {
    const validation = validateRateInRange(config.nrpgField, rate)
    if (validation) {
      nrpgCompliant = validation.valid
      const nrpgDef: NRPGRateRange = NRPG_RATE_RANGES[config.nrpgField]
      nrpgRange = { min: nrpgDef.min, max: nrpgDef.max, unit: nrpgDef.unit }
    }
  }
  // Items with nrpgField: null are market composites — compliant by convention

  return {
    category:    config.category,
    description: scopeItem.description || getDefaultDescription(scopeItem.itemType),
    quantity,
    unit:        config.unit,
    rate,
    subtotal:    Math.round(rate * quantity * 100) / 100,
    nrpgField:   config.nrpgField,
    nrpgCompliant,
    nrpgRange,
    rateSource,
    isEstimated: true,
  }
}

function resolveQuantity(scopeItem: ScopeItemInput, config: ScopeItemNRPGConfig): number {
  // If a quantity is already set on the scope item, honour it
  if (scopeItem.quantity != null && scopeItem.quantity > 0) {
    return scopeItem.quantity
  }

  // Default quantities by unit type
  switch (config.unit) {
    case 'day':
      // Equipment defaults: 5 days (Class 2), adjustable in scope determination
      return 5
    case 'hr':
      // Labour hourly defaults: 2hr extraction minimum
      return 2
    case 'm²':
      // Area items: quantity should come from scope determination
      // 1 m² is a safe minimum to avoid $0 line items
      return 1
    default:
      return 1
  }
}

function getDefaultDescription(itemType: string): string {
  return itemType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ─── PRICING CONFIG FETCH ─────────────────────────────────────────────────────

async function fetchCompanyRates(userId: string): Promise<CompanyPricingRates | null> {
  try {
    const config = await prisma.companyPricingConfig.findUnique({
      where: { userId },
    })
    if (!config) return null

    // Return only the fields CompanyPricingRates needs
    return {
      masterQualifiedNormalHours:       config.masterQualifiedNormalHours,
      qualifiedTechnicianNormalHours:   config.qualifiedTechnicianNormalHours,
      labourerNormalHours:              config.labourerNormalHours,
      airMoverAxialDailyRate:           config.airMoverAxialDailyRate,
      airMoverCentrifugalDailyRate:     config.airMoverCentrifugalDailyRate,
      dehumidifierLGRDailyRate:         config.dehumidifierLGRDailyRate,
      dehumidifierDesiccantDailyRate:   config.dehumidifierDesiccantDailyRate,
      afdUnitLargeDailyRate:            config.afdUnitLargeDailyRate,
      extractionTruckMountedHourlyRate: config.extractionTruckMountedHourlyRate,
      extractionElectricHourlyRate:     config.extractionElectricHourlyRate,
      injectionDryingSystemDailyRate:   config.injectionDryingSystemDailyRate,
      antimicrobialTreatmentRate:       config.antimicrobialTreatmentRate,
      mouldRemediationTreatmentRate:    config.mouldRemediationTreatmentRate,
      biohazardTreatmentRate:           config.biohazardTreatmentRate,
      administrationFee:                config.administrationFee,
      callOutFee:                       config.callOutFee,
      thermalCameraUseCostPerAssessment: config.thermalCameraUseCostPerAssessment,
    }
  } catch (err) {
    console.error('[NIR Cost] Failed to fetch company pricing config:', err)
    return null
  }
}

// ─── CONTINGENCY ──────────────────────────────────────────────────────────────

function calculateContingencyPercentage(scopeItems: ScopeItemInput[]): number {
  // Base: 10%
  let pct = 10

  // +2% for Cat 2/3 contamination (higher complexity and disposal risk)
  const hasCat2Or3 = scopeItems.some(item =>
    item.justification?.includes('Category 2') ||
    item.justification?.includes('Category 3')
  )
  if (hasCat2Or3) pct += 2

  // +2% for specialty testing items (asbestos, mould, lead — unpredictable scope)
  const hasSpecialty = scopeItems.some(item =>
    item.itemType?.includes('mold') ||
    item.itemType?.includes('mould') ||
    item.itemType?.includes('asbestos') ||
    item.itemType?.includes('lead')
  )
  if (hasSpecialty) pct += 2

  // +1% for large area jobs (>50 m² — coordination and access complexity)
  const totalArea = scopeItems
    .filter(item => SCOPE_ITEM_NRPG_CONFIG[item.itemType]?.unit === 'm²')
    .reduce((sum, item) => sum + (item.quantity ?? 0), 0)
  if (totalArea > 50) pct += 1

  return Math.min(15, pct)
}

// ─── NRPG VALIDATION HELPER (public) ─────────────────────────────────────────

/**
 * Validate a full set of pricing rates against NRPG boundaries.
 * Used by the pricing-config route before saving — also callable directly.
 *
 * @returns Array of violations (empty = all compliant)
 */
export function validatePricingConfigNRPG(
  rates: Partial<CompanyPricingRates>
): NRPGViolation[] {
  const violations: NRPGViolation[] = []

  for (const [field, value] of Object.entries(rates)) {
    if (typeof value !== 'number') continue
    const result = validateRateInRange(field, value)
    if (result && !result.valid) {
      violations.push({
        scopeItemDescription: result.label,
        nrpgField:            field,
        rate:                 value,
        min:                  result.min,
        max:                  result.max,
        label:                result.label,
      })
    }
  }

  return violations
}
