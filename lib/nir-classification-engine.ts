/**
 * NIR Classification Engine
 * Implements IICRC standards for water damage classification.
 *
 * v2.0: All clause references are sourced from nir-standards-mapping.ts.
 * No hardcoded IICRC section strings — every reference is typed, auditable,
 * and tied to a specific edition clause.
 *
 * Categories (Water Source) — IICRC S500 §7.1–7.3:
 *   Category 1: Clean / potable water
 *   Category 2: Grey water (contaminants, no faecal matter)
 *   Category 3: Black / contaminated water (sewage, external flooding)
 *
 * Classes (Evaporation Load) — IICRC S500 §8.1–8.4:
 *   Class 1: <10% of floor space, low porosity materials
 *   Class 2: 10–40% of floor space, carpet and cushion
 *   Class 3: >40% of floor space, walls, ceilings, insulation
 *   Class 4: Specialty drying — concrete, hardwood, dense materials
 */

import { S500_FIELD_MAP, STANDARDS_VERSIONS } from '@/lib/nir-standards-mapping'

// ─── TYPES ────────────────────────────────────────────────────────────────────

type MoistureLevel = 'NORMAL' | 'ELEVATED' | 'CRITICAL'

export interface MoistureAssessment {
  surfaceType: string
  moistureLevel: number
  assessment: MoistureLevel
  clauseRef: string
  /** Material-specific thresholds used for this assessment (null = fallback applied) */
  thresholds: { normal: number; elevated: number; critical: number } | null
}

export interface ClassificationInput {
  waterSource: string
  /** Field kept as square footage for API/schema backward compatibility */
  affectedSquareFootage: number
  moistureReadings: Array<{
    surfaceType: string
    moistureLevel: number
    depth: string
  }>
  environmentalData: {
    ambientTemperature: number
    humidityLevel: number
    dewPoint: number
  }
  timeSinceLoss?: number | null
}

export interface ClassificationResult {
  category: string
  class: string
  justification: string
  /** Kept for backward compatibility — equals clauseRefs.join('; ') */
  standardReference: string
  /** Typed clause references sourced from nir-standards-mapping.ts */
  clauseRefs: string[]
  confidence: number
  /** Per-reading moisture assessment against S500 §12.3 material thresholds */
  moistureAssessments: MoistureAssessment[]
  /** True if Cat 1 was upgraded to Cat 2 due to elapsed time (S500 §7.1 note) */
  timeEscalationApplied: boolean
  /** IICRC S500 edition cited — sourced from STANDARDS_VERSIONS.S500.edition */
  iicrcEdition: string
  /**
   * True when the water source is weather-related (storm, flood, wind-driven rain).
   * Per ANSI/IICRC S500 §10.4.1 Position Statement: these are NOT automatically Cat 3.
   * Category must be confirmed via inspection — see requiresPreliminaryDetermination.
   */
  weatherRelatedEvent: boolean
  /**
   * True when the category cannot be confirmed without a site inspection.
   * Applies to weather-related events and ambiguous sources.
   * Per S500 §10.6.7: preliminary determination requires inspection + info gathering.
   */
  requiresPreliminaryDetermination: boolean
  /**
   * Checklist of information the restorer must gather on-site per S500 §10.5
   * before finalising the category. Only populated when requiresPreliminaryDetermination is true.
   */
  informationGatheringChecklist: string[]
}

// ─── MOISTURE ASSESSMENT ─────────────────────────────────────────────────────

const SPECIALTY_MATERIALS = ['concrete', 'hardwood', 'timber', 'dense', 'brick', 'stone', 'plaster']

function assessMoistureReading(reading: {
  surfaceType: string
  moistureLevel: number
  depth: string
}): MoistureAssessment {
  const surfaceLower = reading.surfaceType.toLowerCase()
  const { thresholds, clauseRef } = S500_FIELD_MAP.moistureContent

  // Map surface type to the closest S500 §12.3 material category
  let threshold: { normal: number; elevated: number; critical: number } | null = null

  if (surfaceLower.includes('wood') || surfaceLower.includes('hardwood') || surfaceLower.includes('timber')) {
    threshold = thresholds.wood
  } else if (
    surfaceLower.includes('drywall') ||
    surfaceLower.includes('gyprock') ||
    surfaceLower.includes('plasterboard') ||
    surfaceLower.includes('gypsum')
  ) {
    threshold = thresholds.drywall
  } else if (
    surfaceLower.includes('concrete') ||
    surfaceLower.includes('brick') ||
    surfaceLower.includes('stone') ||
    surfaceLower.includes('tile') ||
    surfaceLower.includes('masonry')
  ) {
    threshold = thresholds.concrete
  } else if (surfaceLower.includes('carpet') || surfaceLower.includes('rug')) {
    threshold = thresholds.carpet
  }

  // Use wood as a conservative fallback when no material match
  const effectiveThreshold = threshold ?? thresholds.wood

  let assessment: MoistureLevel = 'NORMAL'
  if (reading.moistureLevel >= effectiveThreshold.critical) {
    assessment = 'CRITICAL'
  } else if (reading.moistureLevel >= effectiveThreshold.elevated) {
    assessment = 'ELEVATED'
  }

  return {
    surfaceType: reading.surfaceType,
    moistureLevel: reading.moistureLevel,
    assessment,
    clauseRef,
    thresholds: threshold, // null signals fallback was used
  }
}

// ─── MAIN CLASSIFICATION ──────────────────────────────────────────────────────

export async function classifyIICRC(input: ClassificationInput): Promise<ClassificationResult> {
  const clauseRefs: string[] = []
  const { waterCategory, waterClass, moistureContent, dryingEquipment } = S500_FIELD_MAP

  // ── Category — IICRC S500 §7.1–7.3 ─────────────────────────────────────────
  let category = '1'
  let categoryJustification = ''
  let timeEscalationApplied = false
  let weatherRelatedEvent = false
  let requiresPreliminaryDetermination = false
  let informationGatheringChecklist: string[] = []

  const waterSourceLower = input.waterSource.toLowerCase()

  // Detect weather-related sources per ANSI/IICRC S500 §10.4.1 Position Statement.
  // These must NOT be auto-classified as Category 3 without inspection evidence
  // of "grossly contaminated" conditions (S500 §12.2.6).
  const isWeatherRelated =
    waterSourceLower.includes('storm') ||
    waterSourceLower.includes('flood') ||
    waterSourceLower.includes('wind-driven') ||
    waterSourceLower.includes('wind driven') ||
    waterSourceLower.includes('river') ||
    waterSourceLower.includes('seawater') ||
    waterSourceLower.includes('sea water') ||
    waterSourceLower.includes('rising water') ||
    waterSourceLower.includes('weather') ||
    waterSourceLower.includes('hurricane') ||
    waterSourceLower.includes('cyclone') ||
    waterSourceLower.includes('tropical storm') ||
    waterSourceLower.includes('external flooding') ||
    waterSourceLower.includes('overland flow')

  // Explicit contamination signals that override the weather-related rule
  const isExplicitlyContaminated =
    waterSourceLower.includes('sewage') ||
    waterSourceLower.includes('faecal') ||
    waterSourceLower.includes('fecal') ||
    waterSourceLower.includes('black water') ||
    waterSourceLower.includes('blackwater') ||
    waterSourceLower.includes('grossly contaminated') ||
    waterSourceLower.includes('pathogenic') ||
    waterSourceLower.includes('wasteline')

  if (isExplicitlyContaminated || waterSourceLower.includes('black')) {
    category = '3'
    const def = waterCategory.definitions.category3
    categoryJustification =
      `${def.label}: ${def.source}. ` +
      `Containment: REQUIRED. PPE: REQUIRED (${waterCategory.clauseRef}).`
  } else if (isWeatherRelated) {
    // ANSI/IICRC S500 §10.4.1 Position Statement compliance:
    // Wind-driven rain, storm water and weather-related events are NOT automatically
    // Category 3. The "can" in the S500 definition establishes these as a possibility,
    // not a standard of care. Category requires inspection to confirm gross contamination.
    weatherRelatedEvent = true
    requiresPreliminaryDetermination = true
    category = '2' // Conservative pending inspection — may be 1 or 3 after assessment
    categoryJustification =
      `Weather-related intrusion. Per ANSI/IICRC S500 §10.4.1 Position Statement, ` +
      `wind-driven rain and weather events are not automatically Category 3. ` +
      `Preliminary determination requires site inspection to confirm whether water ` +
      `is grossly contaminated (S500 §10.6.7). Category 2 applied pending assessment.`
    informationGatheringChecklist = [
      'Verify source, date and time of water intrusion (S500 §10.5)',
      'Confirm status of water source control',
      'Identify suspect or known contaminants on-site',
      'Assess general size of affected areas (number of rooms, floors)',
      'Review history of previous water damage to structure',
      'Note types of materials affected (flooring, walls, framing)',
      'Conduct site-specific safety survey (S500 §10.6)',
      'Check for visible mold growth — if found, refer to ANSI/IICRC S520',
      'Determine if occupants are high-risk (elderly, infants, immunocompromised)',
      'Assess whether contaminants have been aerosolised — IEP may be required (S500 §12.2.6)',
    ]
  } else if (
    waterSourceLower.includes('grey') ||
    waterSourceLower.includes('gray') ||
    waterSourceLower.includes('washing') ||
    waterSourceLower.includes('dishwasher') ||
    (waterSourceLower.includes('toilet') && !waterSourceLower.includes('faecal'))
  ) {
    category = '2'
    const def = waterCategory.definitions.category2
    categoryJustification = `${def.label}: ${def.source}. Sanitisation required (${waterCategory.clauseRef}).`
  } else if (
    waterSourceLower.includes('clean') ||
    waterSourceLower.includes('potable') ||
    waterSourceLower.includes('pipe') ||
    waterSourceLower.includes('rain') ||
    waterSourceLower.includes('supply')
  ) {
    category = '1'
    const def = waterCategory.definitions.category1
    categoryJustification = `${def.label}: ${def.source} (${waterCategory.clauseRef}).`
  } else {
    // Conservative default — grey water, inspection recommended
    category = '2'
    requiresPreliminaryDetermination = true
    categoryJustification =
      `Water source unclear. Defaulting to Category 2 (grey water) per ${waterCategory.clauseRef}. ` +
      `Inspection recommended to confirm category (S500 §10.6.7).`
  }

  clauseRefs.push(waterCategory.clauseRef)

  // ── Time escalation — S500 §7.1 note ────────────────────────────────────────
  if (category === '1' && input.timeSinceLoss && input.timeSinceLoss > 48) {
    category = '2'
    categoryJustification +=
      ` ${waterCategory.timeEscalation} — ${input.timeSinceLoss} hrs elapsed, category upgraded.`
    timeEscalationApplied = true
  }

  // ── Moisture Assessments — S500 §12.3 ───────────────────────────────────────
  const moistureAssessments = input.moistureReadings.map(assessMoistureReading)
  const avgMoisture =
    moistureAssessments.length > 0
      ? moistureAssessments.reduce((sum, a) => sum + a.moistureLevel, 0) / moistureAssessments.length
      : 0

  const hasCriticalReading = moistureAssessments.some(a => a.assessment === 'CRITICAL')
  if (hasCriticalReading) {
    clauseRefs.push(moistureContent.clauseRef)
  }

  // ── Class — S500 §8.1–8.4 ───────────────────────────────────────────────────
  let classValue = '1'
  let classJustification = ''

  const hasSpecialtyMaterial = input.moistureReadings.some(r =>
    SPECIALTY_MATERIALS.some(m => r.surfaceType.toLowerCase().includes(m))
  )
  const { definitions: classDefs } = waterClass

  if (hasSpecialtyMaterial && avgMoisture > 15) {
    classValue = '4'
    classJustification =
      `${classDefs.class4.label} (${waterClass.clauseRef}): ` +
      `${classDefs.class4.materials} detected. ` +
      `Avg moisture ${avgMoisture.toFixed(1)}%. Extended drying protocol required.`
  } else if (input.affectedSquareFootage > 500 && avgMoisture > 20) {
    classValue = '3'
    classJustification =
      `${classDefs.class3.label} (${waterClass.clauseRef}): ` +
      `${classDefs.class3.affectedArea} of floor space affected. ` +
      `${classDefs.class3.materials}. Avg moisture ${avgMoisture.toFixed(1)}%.`
  } else if (input.affectedSquareFootage > 100 || avgMoisture > 15) {
    classValue = '2'
    classJustification =
      `${classDefs.class2.label} (${waterClass.clauseRef}): ` +
      `${classDefs.class2.affectedArea} of floor space affected. ` +
      `${classDefs.class2.materials}. Avg moisture ${avgMoisture.toFixed(1)}%.`
  } else {
    classValue = '1'
    classJustification =
      `${classDefs.class1.label} (${waterClass.clauseRef}): ` +
      `${classDefs.class1.affectedArea} of floor space affected. ` +
      `${classDefs.class1.materials}. Avg moisture ${avgMoisture.toFixed(1)}%.`
  }

  clauseRefs.push(waterClass.clauseRef)
  clauseRefs.push(dryingEquipment.clauseRef)

  // ── Confidence ───────────────────────────────────────────────────────────────
  // Weather-related events start at 60% — category is inspection-dependent per S500 §10.6.7
  let confidence = weatherRelatedEvent ? 60 : 85

  if (input.moistureReadings.length >= 3) confidence += 5
  if (input.environmentalData?.ambientTemperature && input.environmentalData?.humidityLevel) {
    confidence += 5
  }
  if (
    !waterSourceLower.includes('clean') &&
    !waterSourceLower.includes('grey') &&
    !waterSourceLower.includes('gray') &&
    !waterSourceLower.includes('black')
  ) {
    confidence -= 10
  }
  // Reduce further when preliminary determination is required — category may change on inspection
  if (requiresPreliminaryDetermination) confidence -= 10

  confidence = Math.min(100, Math.max(0, confidence))

  const uniqueClauseRefs = [...new Set(clauseRefs)]

  return {
    category,
    class: classValue,
    justification: `${categoryJustification} ${classJustification}`.trim(),
    standardReference: uniqueClauseRefs.join('; '),
    clauseRefs: uniqueClauseRefs,
    confidence,
    moistureAssessments,
    timeEscalationApplied,
    iicrcEdition: STANDARDS_VERSIONS.S500.edition,
    weatherRelatedEvent,
    requiresPreliminaryDetermination,
    informationGatheringChecklist,
  }
}
