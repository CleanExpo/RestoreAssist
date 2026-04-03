/**
 * RestoreAssist Evaluation Harness
 *
 * Runs the scope generation pipeline against golden test cases from
 * `content/training/scope-examples.json`, scores each with the deterministic
 * ScopeQualityEvaluator, and produces an aggregate report.
 *
 * Requires `ANTHROPIC_API_KEY` env var for live generation.
 * Gracefully reports if the key is missing rather than throwing.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import {
  evaluateScopeQuality,
  type ScopeEvaluationInput,
  type ScopeQualityScore,
} from './scope-quality-evaluator'
import {
  getClaimTypePrompt,
  type ClaimType,
  type ClaimTypePromptOptions,
} from './claim-type-prompts'

// ============================================================
// Types
// ============================================================

export interface EvaluationOptions {
  /** Which claim types to evaluate. Default: all */
  claimTypes?: string[]
  /** Max test cases per claim type. Default: all available */
  sampleSize?: number
  /** Optional custom prompt text to evaluate instead of production prompt */
  promptOverride?: string
}

export interface TestCaseResult {
  testCaseId: string
  claimType: string
  score: ScopeQualityScore
  generatedScope: string
  durationMs: number
}

export interface EvaluationReport {
  timestamp: string
  totalTestCases: number
  results: TestCaseResult[]
  aggregate: {
    meanComposite: number
    minComposite: number
    maxComposite: number
    stdDev: number
    meanByClaimType: Record<string, number>
  }
}

// ============================================================
// Test case schema (mirrors scope-examples.json structure)
// ============================================================

interface ScopeTestCase {
  id: string
  claimType: string
  damageCategory: number | null
  damageClass: number | null
  propertyDescription: string
  causeOfLoss: string
  scope: string
  equipmentList: Record<string, { quantity: number; spec?: string; days?: number; uses?: number }>
  estimatedValueAud: number
  estimatedDurationDays: number
  iicrcReferences: string[]
}

// ============================================================
// Helpers
// ============================================================

function loadTestCases(): ScopeTestCase[] {
  // Resolve relative to the project root. In Next.js the cwd is project root.
  const filePath = join(process.cwd(), 'content', 'training', 'scope-examples.json')
  const raw = readFileSync(filePath, 'utf-8')
  return JSON.parse(raw) as ScopeTestCase[]
}

/**
 * Normalise claimType strings from test data to the ClaimType union.
 * scope-examples.json uses "mould_remediation" but claim-type-prompts.ts
 * uses "mould". Handle this and other possible mismatches.
 */
function normaliseClaimType(raw: string): ClaimType {
  const map: Record<string, ClaimType> = {
    water_damage: 'water_damage',
    fire_smoke: 'fire_smoke',
    fire: 'fire_smoke',
    smoke: 'fire_smoke',
    storm: 'storm',
    mould: 'mould',
    mould_remediation: 'mould',
    mold: 'mould',
    contents: 'contents',
  }
  return map[raw.toLowerCase()] ?? 'water_damage'
}

/**
 * Extract a numeric area from the property description text.
 * Looks for patterns like "22 m²" or "68 m² affected".
 */
function extractAreaFromDescription(description: string): number | undefined {
  // Try to find the "total affected area" or the last m² mention
  const allAreas = [...description.matchAll(/(\d+(?:\.\d+)?)\s*m²/g)]
  if (allAreas.length === 0) return undefined
  // Prefer a match near "affected" or "total"
  for (const m of allAreas) {
    const idx = m.index ?? 0
    const context = description.slice(Math.max(0, idx - 30), idx + (m[0]?.length ?? 0) + 10)
    if (/affected|total|combined/i.test(context)) {
      return parseFloat(m[1])
    }
  }
  // Fallback: last area mentioned is often the total
  const lastMatch = allAreas[allAreas.length - 1]
  return lastMatch ? parseFloat(lastMatch[1]) : undefined
}

/**
 * Build a simplified user message for evaluation from a test case.
 * Mirrors what the generate-scope route builds, but only from the
 * test case data (no DB or moisture readings).
 */
function buildEvalUserMessage(tc: ScopeTestCase): string {
  const area = extractAreaFromDescription(tc.propertyDescription)
  const catLabel = tc.damageCategory
    ? `Category ${tc.damageCategory}`
    : 'N/A'
  const classLabel = tc.damageClass
    ? `Class ${tc.damageClass}`
    : 'N/A'

  const lines: string[] = [
    `Generate a scope of works for the following restoration inspection:`,
    ``,
    `**Property:** ${tc.propertyDescription}`,
    `**IICRC Classification:** ${catLabel} / ${classLabel}`,
    `**Cause of Loss:** ${tc.causeOfLoss}`,
  ]

  if (area) {
    lines.push(`**Total Affected Area:** ${area} m²`)
  }

  // Include equipment list as context (the model should reference ratios)
  const equipKeys = Object.keys(tc.equipmentList)
  if (equipKeys.length > 0) {
    lines.push(``)
    lines.push(`**Equipment Calculated (IICRC ratios):**`)
    for (const key of equipKeys) {
      const eq = tc.equipmentList[key]
      lines.push(`- ${key}: ${eq.quantity} × ${eq.spec ?? 'standard unit'}`)
    }
  }

  lines.push(``)
  lines.push(
    `Produce the scope in exactly 7 numbered sections with IICRC citations. ` +
    `Include equipment table, moisture targets, and drying validation criteria.`
  )

  return lines.join('\n')
}

/**
 * Compute standard deviation from an array of numbers.
 */
function stdDev(values: number[]): number {
  if (values.length === 0) return 0
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const sqDiffs = values.map((v) => (v - mean) ** 2)
  return Math.sqrt(sqDiffs.reduce((s, v) => s + v, 0) / values.length)
}

// ============================================================
// Main evaluation runner
// ============================================================

export async function runEvaluationSuite(
  options?: EvaluationOptions
): Promise<EvaluationReport> {
  // Lazy-import the Anthropic SDK so we fail gracefully if not installed
  let Anthropic: typeof import('@anthropic-ai/sdk').default
  try {
    const mod = await import('@anthropic-ai/sdk')
    Anthropic = mod.default
  } catch {
    throw new Error(
      'Anthropic SDK not available. Install @anthropic-ai/sdk to run evaluations.'
    )
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is not set. ' +
      'Set it to run live scope generation evaluations.'
    )
  }

  const anthropic = new Anthropic()

  // Load and filter test cases
  let testCases = loadTestCases()

  if (options?.claimTypes && options.claimTypes.length > 0) {
    const allowed = new Set(options.claimTypes.map((t) => normaliseClaimType(t)))
    testCases = testCases.filter((tc) =>
      allowed.has(normaliseClaimType(tc.claimType))
    )
  }

  if (options?.sampleSize && options.sampleSize > 0) {
    // Group by claim type, take sampleSize per group
    const grouped: Record<string, ScopeTestCase[]> = {}
    for (const tc of testCases) {
      const key = normaliseClaimType(tc.claimType)
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(tc)
    }
    testCases = []
    for (const group of Object.values(grouped)) {
      testCases.push(...group.slice(0, options.sampleSize))
    }
  }

  const results: TestCaseResult[] = []

  for (const tc of testCases) {
    const claimType = normaliseClaimType(tc.claimType)
    const area = extractAreaFromDescription(tc.propertyDescription)

    // Build system prompt
    const promptOptions: ClaimTypePromptOptions = {
      damageCategory: tc.damageCategory ?? undefined,
      damageClass: tc.damageClass ?? undefined,
    }
    const systemPrompt = options?.promptOverride ?? getClaimTypePrompt(claimType, promptOptions)

    // Build user message
    const userMessage = buildEvalUserMessage(tc)

    // Generate scope via Anthropic SDK
    const startTime = Date.now()
    let generatedScope = ''

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      })

      // Extract text content from response
      for (const block of response.content) {
        if (block.type === 'text') {
          generatedScope += block.text
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown API error'
      generatedScope = `[GENERATION FAILED: ${message}]`
    }

    const durationMs = Date.now() - startTime

    // Score the generated scope
    const evalInput: ScopeEvaluationInput = {
      claimType,
      damageCategory: tc.damageCategory ?? undefined,
      damageClass: tc.damageClass ?? undefined,
      affectedAreaM2: area,
    }

    const score = evaluateScopeQuality(generatedScope, evalInput)

    results.push({
      testCaseId: tc.id,
      claimType,
      score,
      generatedScope,
      durationMs,
    })
  }

  // Compute aggregates
  const composites = results.map((r) => r.score.composite)
  const meanComposite =
    composites.length > 0
      ? Math.round((composites.reduce((s, v) => s + v, 0) / composites.length) * 100) / 100
      : 0
  const minComposite = composites.length > 0 ? Math.min(...composites) : 0
  const maxComposite = composites.length > 0 ? Math.max(...composites) : 0
  const compositeStdDev = Math.round(stdDev(composites) * 100) / 100

  // Mean by claim type
  const meanByClaimType: Record<string, number> = {}
  const grouped: Record<string, number[]> = {}
  for (const r of results) {
    if (!grouped[r.claimType]) grouped[r.claimType] = []
    grouped[r.claimType].push(r.score.composite)
  }
  for (const [ct, scores] of Object.entries(grouped)) {
    meanByClaimType[ct] =
      Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 100) / 100
  }

  return {
    timestamp: new Date().toISOString(),
    totalTestCases: results.length,
    results,
    aggregate: {
      meanComposite,
      minComposite,
      maxComposite,
      stdDev: compositeStdDev,
      meanByClaimType,
    },
  }
}
