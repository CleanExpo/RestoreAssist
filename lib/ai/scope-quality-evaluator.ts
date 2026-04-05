/**
 * RestoreAssist Scope Quality Evaluator
 *
 * Deterministic, offline scorer for generated scope-of-works documents.
 * Scores on a 0–100 composite scale across five dimensions:
 *   1. Structural completeness (30%)
 *   2. IICRC citation density  (25%)
 *   3. Equipment ratio correctness (20%)
 *   4. Specificity / hedging penalty (15%)
 *   5. Category compliance (10%)
 *
 * No API calls — pure string parsing and arithmetic.
 */

// ============================================================
// Types
// ============================================================

export interface ScopeEvaluationInput {
  claimType: string
  damageCategory?: number
  damageClass?: number
  affectedAreaM2?: number
}

export interface ScopeQualityScore {
  /** 0–100 weighted composite */
  composite: number
  /** 0–100: all 7 sections present? */
  structural: number
  /** 0–100: IICRC refs per section */
  citationDensity: number
  /** 0–100: quantities match S500 ratios */
  equipmentAccuracy: number
  /** 0–100: penalise hedging words */
  specificity: number
  /** 0–100: category-specific requirements met */
  categoryCompliance: number
  details: {
    sectionsFound: number[]
    sectionsMissing: number[]
    iicrcRefsCount: number
    hedgingWords: string[]
    equipmentIssues: string[]
  }
}

// ============================================================
// Section detection
// ============================================================

/**
 * Known section heading patterns. Each section number maps to a list of
 * keywords that identify it even without explicit numbering.
 */
const SECTION_KEYWORDS: Record<number, RegExp[]> = {
  1: [
    /water\s+source/i,
    /loss\s+(source|mechanism)/i,
    /fire\s+origin/i,
    /breach\s+identification/i,
    /visual\s+assessment/i,
    /contamination\s+mapping/i,
  ],
  2: [
    /initial\s+emergency/i,
    /initial\s+extraction/i,
    /emergency\s+services/i,
    /moisture\s+source/i,
    /make-?safe/i,
    /temporary\s+protection/i,
    /smoke\s+migration/i,
  ],
  3: [
    /affected\s+materials/i,
    /materials?\s+(&|and)\s+extent/i,
    /contamination\s+boundary/i,
    /water\s+intrusion\s+extent/i,
    /affected\s+materials\s+assessment/i,
    /cleaning\s+methods/i,
  ],
  4: [
    /psychrometric/i,
    /containment\s+setup/i,
    /affected\s+materials\s+assessment/i,
    /cleaning\s+methods/i,
    /contents\s+inventory/i,
  ],
  5: [
    /drying\s+equipment/i,
    /equipment\s+setup/i,
    /remediation\s+scope/i,
    /structural\s+drying/i,
    /deodorisation/i,
    /contents\s+at\s+risk/i,
    /antimicrobial/i,
  ],
  6: [
    /daily\s+monitoring/i,
    /monitoring\s+protocol/i,
    /disposal\s+protocol/i,
    /structural\s+drying/i,
    /clearance\s+(&|and)\s+sign/i,
  ],
  7: [
    /drying\s+validation/i,
    /sign[- ]?off/i,
    /clearance\s+testing/i,
    /reinstatement/i,
  ],
}

/**
 * Find which of the 7 expected sections are present in the scope text.
 * Looks for explicit `## N.` headings first, then falls back to keyword matching.
 */
function detectSections(scope: string): { found: number[]; missing: number[] } {
  const found = new Set<number>()

  // Pass 1: explicit numbered headings (## 1. ... or # 1) ... or **1.** etc.)
  const numberedHeadingPattern = /(?:^|\n)\s*(?:#{1,3}\s*)?(\d+)[\.\)]\s+/gm
  let match: RegExpExecArray | null
  while ((match = numberedHeadingPattern.exec(scope)) !== null) {
    const num = parseInt(match[1], 10)
    if (num >= 1 && num <= 7) {
      found.add(num)
    }
    // Some scopes go up to 8 sections (fire/smoke) — treat 8 as bonus section 7
    if (num === 8) {
      found.add(7)
    }
  }

  // Pass 2: keyword fallback for sections not yet found
  for (let s = 1; s <= 7; s++) {
    if (found.has(s)) continue
    const patterns = SECTION_KEYWORDS[s]
    if (patterns && patterns.some((re) => re.test(scope))) {
      found.add(s)
    }
  }

  const foundArr = Array.from(found).sort((a, b) => a - b)
  const missing: number[] = []
  for (let s = 1; s <= 7; s++) {
    if (!found.has(s)) missing.push(s)
  }
  return { found: foundArr, missing }
}

// ============================================================
// IICRC citation counting
// ============================================================

function countIicrcReferences(scope: string): number {
  const patterns: RegExp[] = [
    /IICRC\s+S\d+:\d{4}/g,
    /S500:\d{4}/g,
    /S520/g,
    /S770/g,
    /§[\d.]+/g,
  ]

  // Collect all unique match positions to avoid double-counting overlapping patterns
  const matchPositions = new Set<string>()

  for (const pattern of patterns) {
    let m: RegExpExecArray | null
    // Reset lastIndex for safety
    pattern.lastIndex = 0
    while ((m = pattern.exec(scope)) !== null) {
      // Key by position + match text to deduplicate
      matchPositions.add(`${m.index}:${m[0]}`)
    }
  }

  return matchPositions.size
}

// ============================================================
// Equipment extraction & ratio checking
// ============================================================

interface ExtractedEquipment {
  airMovers: number | null
  dehumidifiers: number | null
}

function extractEquipmentQuantities(scope: string): ExtractedEquipment {
  let airMovers: number | null = null
  let dehumidifiers: number | null = null

  // Air movers: look for patterns like "4 × 1.5 kW" or "Air movers | 4" or "4 air movers"
  const airMoverPatterns: RegExp[] = [
    /air\s*movers?\s*(?:\([\w\s,./-]+\))?\s*\|\s*(\d+)/i,
    /(\d+)\s*[×x]\s*[\d.]+\s*kW\s*(?:units?)?\s*\|\s*(?:.*air\s*mover)/i,
    /air\s*movers?\s*[:\s]*(\d+)/i,
    /(\d+)\s*(?:[×x]\s*)?(?:[\d.]+\s*kW\s*)?air\s*movers?/i,
    // Table row format: | Air movers ... | N × ...
    /[Aa]ir\s+movers?\s*(?:\([^)]*\))?\s*\|\s*(\d+)\s*[×x]/,
  ]

  for (const pattern of airMoverPatterns) {
    const m = scope.match(pattern)
    if (m && m[1]) {
      airMovers = parseInt(m[1], 10)
      break
    }
  }

  // Dehumidifiers: look for "LGR Dehumidifier | 2" or "2 × dehumidifier" etc.
  const dehuPatterns: RegExp[] = [
    /[Dd]ehumidifier\s*\|\s*(\d+)/,
    /(\d+)\s*[×x]\s*[\d]+\s*[Ll]\/day/,
    /[Dd]ehumidifier[s]?\s*[:\s]*(\d+)/,
    /(\d+)\s*(?:[×x]\s*)?(?:[\d.]+\s*[Ll]\/day\s*)?(?:LGR\s+)?[Dd]ehumidifier/,
    // Table row format: | LGR Dehumidifier | N × ...
    /LGR\s+[Dd]ehumidifier\s*\|\s*(\d+)\s*[×x]/,
  ]

  for (const pattern of dehuPatterns) {
    const m = scope.match(pattern)
    if (m && m[1]) {
      dehumidifiers = parseInt(m[1], 10)
      break
    }
  }

  return { airMovers, dehumidifiers }
}

function scoreEquipmentAccuracy(
  scope: string,
  affectedAreaM2: number | undefined
): { score: number; issues: string[] } {
  if (affectedAreaM2 === undefined || affectedAreaM2 <= 0) {
    return { score: 50, issues: ['No affected area provided — neutral score'] }
  }

  const extracted = extractEquipmentQuantities(scope)
  const issues: string[] = []
  let totalDeviation = 0

  // Expected air movers: ceil(area / 15)
  const expectedAirMovers = Math.ceil(affectedAreaM2 / 15)
  if (extracted.airMovers !== null) {
    const deviation = Math.abs(extracted.airMovers - expectedAirMovers)
    if (deviation > 0) {
      issues.push(
        `Air movers: found ${extracted.airMovers}, expected ${expectedAirMovers} (ceil(${affectedAreaM2}/15)). Deviation: ${deviation}`
      )
    }
    totalDeviation += deviation
  } else {
    issues.push('Could not extract air mover quantity from scope text')
    totalDeviation += 2 // Moderate penalty for missing data
  }

  // Expected dehumidifiers: ceil(area / 40)
  const expectedDehu = Math.ceil(affectedAreaM2 / 40)
  if (extracted.dehumidifiers !== null) {
    const deviation = Math.abs(extracted.dehumidifiers - expectedDehu)
    if (deviation > 0) {
      issues.push(
        `Dehumidifiers: found ${extracted.dehumidifiers}, expected ${expectedDehu} (ceil(${affectedAreaM2}/40)). Deviation: ${deviation}`
      )
    }
    totalDeviation += deviation
  } else {
    issues.push('Could not extract dehumidifier quantity from scope text')
    totalDeviation += 2
  }

  const score = Math.max(0, 100 - 20 * totalDeviation)
  return { score, issues }
}

// ============================================================
// Hedging / specificity check
// ============================================================

/**
 * Hedging words that indicate vague language. We only penalise them when they
 * are NOT immediately followed by a number (e.g. "adequate 4" is fine, but
 * "adequate ventilation" is not).
 */
const HEDGING_WORDS = [
  'adequate',
  'appropriate',
  'as needed',
  'sufficient',
  'some',
  'various',
  'multiple',
  'several',
]

function findHedgingWords(scope: string): string[] {
  const found: string[] = []
  const lowerScope = scope.toLowerCase()

  for (const word of HEDGING_WORDS) {
    // Build a regex that matches the word NOT followed by a digit
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`\\b${escaped}\\b(?!\\s*\\d)`, 'gi')
    const matches = lowerScope.match(pattern)
    if (matches) {
      for (const m of matches) {
        found.push(word)
      }
    }
  }

  return found
}

// ============================================================
// Category compliance
// ============================================================

function scoreCategoryCompliance(
  scope: string,
  damageCategory: number | undefined
): number {
  if (damageCategory === undefined) {
    return 70 // Neutral when not provided
  }

  if (damageCategory === 1) {
    return 100 // Category 1 has no special requirements
  }

  const lowerScope = scope.toLowerCase()
  let score = 0

  if (damageCategory === 2) {
    // Must mention "antimicrobial"
    if (/antimicrobial/i.test(scope)) score += 50
    // Must mention "grey water" or "Category 2"
    if (/grey\s*water/i.test(scope) || /category\s*2/i.test(scope)) score += 50
  }

  if (damageCategory === 3) {
    // Must mention "PPE"
    if (/\bPPE\b/.test(scope)) score += 25
    // Must mention "remove" + "porous"
    if (/remov/i.test(scope) && /porous/i.test(scope)) score += 25
    // Must mention "Category 3" or "black water"
    if (/category\s*3/i.test(scope) || /black\s*water/i.test(scope)) score += 25
    // Must mention "hygienist" or "clearance"
    if (/hygienist/i.test(scope) || /clearance/i.test(scope)) score += 25
  }

  return score
}

// ============================================================
// Main evaluator
// ============================================================

export function evaluateScopeQuality(
  scope: string,
  input: ScopeEvaluationInput
): ScopeQualityScore {
  // 1. Structural completeness (weight 30%)
  const { found: sectionsFound, missing: sectionsMissing } = detectSections(scope)
  const structural = Math.round((sectionsFound.length / 7) * 100)

  // 2. IICRC citation density (weight 25%)
  const iicrcRefsCount = countIicrcReferences(scope)
  const citationDensity = Math.min(100, Math.round((iicrcRefsCount / 7) * 100))

  // 3. Equipment ratio correctness (weight 20%)
  const { score: equipmentAccuracy, issues: equipmentIssues } = scoreEquipmentAccuracy(
    scope,
    input.affectedAreaM2
  )

  // 4. Specificity score (weight 15%)
  const hedgingWords = findHedgingWords(scope)
  const specificity = Math.max(0, 100 - 15 * hedgingWords.length)

  // 5. Category compliance (weight 10%)
  const categoryCompliance = scoreCategoryCompliance(scope, input.damageCategory)

  // Composite: weighted sum
  const composite = Math.round(
    0.30 * structural +
    0.25 * citationDensity +
    0.20 * equipmentAccuracy +
    0.15 * specificity +
    0.10 * categoryCompliance
  )

  return {
    composite,
    structural,
    citationDensity,
    equipmentAccuracy,
    specificity,
    categoryCompliance,
    details: {
      sectionsFound,
      sectionsMissing,
      iicrcRefsCount,
      hedgingWords,
      equipmentIssues,
    },
  }
}
