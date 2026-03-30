/**
 * RestoreAssist Prompt Optimizer — RA-281
 *
 * Implements the autoresearch pattern adapted for IICRC scope prompt engineering:
 *   1. Load production prompt for a claim type
 *   2. Evaluate baseline quality against test cases
 *   3. Meta-prompt Claude to suggest targeted edits
 *   4. Evaluate each variant, promote if it beats current by ≥ threshold
 *   5. Return audit trail of all variants tried
 *
 * Budget-bounded: tracks API calls and estimated cost in AUD.
 * No side effects — does not modify the production prompt store.
 * Caller is responsible for persisting any promoted variant.
 */

import Anthropic from '@anthropic-ai/sdk'
import { getClaimTypePrompt, type ClaimType } from './claim-type-prompts'
import {
  evaluateScopeQuality,
  type ScopeEvaluationInput,
  type ScopeQualityScore,
} from './scope-quality-evaluator'

// ============================================================
// Types
// ============================================================

export interface OptimizationOptions {
  /** Which claim type to optimize */
  claimType: string
  /** Number of Claude API calls to budget. Default 30 */
  budget?: number
  /** Minimum score improvement to promote a variant. Default 2 */
  threshold?: number
  /** Number of test cases per evaluation. Default 3 */
  testCasesPerEval?: number
  /** Number of candidate edits per iteration. Default 3 */
  candidatesPerIteration?: number
}

export interface OptimizationResult {
  claimType: string
  iterations: number
  totalApiCalls: number
  estimatedCostAud: number
  baselineScore: number
  bestScore: number
  improved: boolean
  bestPromptPreview: string
  variants: VariantRecord[]
}

interface VariantRecord {
  version: number
  compositeScore: number
  description: string
  promoted: boolean
}

interface CandidateEdit {
  description: string
  oldText: string
  newText: string
}

interface TestCase {
  id: string
  claimType: string
  damageCategory: number | null
  damageClass: number | null
  propertyDescription: string
  causeOfLoss: string
  scope: string
  affectedAreaM2: number
}

// ============================================================
// Constants
// ============================================================

/** Estimated cost per Sonnet API call in AUD (input + output avg) */
const COST_PER_CALL_AUD = 0.02

/** Maximum API call budget ceiling (hard limit, regardless of options) */
const MAX_BUDGET = 50

/** Claude model for scope generation and meta-prompting */
const MODEL = 'claude-sonnet-4-5' as const

// ============================================================
// Test case loader
// ============================================================

/**
 * Load and parse test cases from the training examples file.
 * Returns only cases matching the requested claim type.
 */
async function loadTestCases(claimType: string): Promise<TestCase[]> {
  // Dynamic import for the JSON file — works in both Node.js and Next.js
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const examples: Array<Record<string, unknown>> = await import(
    '@/content/training/scope-examples.json'
  ).then((m) => m.default ?? m)

  return examples
    .filter((ex) => {
      const ct = ex.claimType as string
      // Normalise: 'mould_remediation' matches 'mould'
      const normalised = ct === 'mould_remediation' ? 'mould' : ct
      const targetNormalised = claimType === 'mould_remediation' ? 'mould' : claimType
      return normalised === targetNormalised
    })
    .map((ex) => {
      // Extract affected area from scope text or property description
      const areaMatch = (ex.propertyDescription as string).match(/(\d+)\s*m²\s*(?:affected|total|combined)/i)
      const affectedAreaM2 = areaMatch ? parseInt(areaMatch[1], 10) : 30

      return {
        id: ex.id as string,
        claimType: ex.claimType as string,
        damageCategory: ex.damageCategory as number | null,
        damageClass: ex.damageClass as number | null,
        propertyDescription: ex.propertyDescription as string,
        causeOfLoss: ex.causeOfLoss as string,
        scope: ex.scope as string,
        affectedAreaM2,
      }
    })
}

/**
 * Randomly sample `n` test cases from the available pool.
 * If fewer than `n` are available, returns all of them.
 */
function sampleTestCases(cases: TestCase[], n: number): TestCase[] {
  if (cases.length <= n) return [...cases]

  const shuffled = [...cases]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled.slice(0, n)
}

// ============================================================
// Score helpers
// ============================================================

/**
 * Identify the lowest-scoring sub-dimension from a ScopeQualityScore.
 */
function findLowestDimension(score: ScopeQualityScore): {
  name: string
  value: number
} {
  const dimensions: Array<{ name: string; value: number }> = [
    { name: 'structural', value: score.structural },
    { name: 'citationDensity', value: score.citationDensity },
    { name: 'equipmentAccuracy', value: score.equipmentAccuracy },
    { name: 'specificity', value: score.specificity },
    { name: 'categoryCompliance', value: score.categoryCompliance },
  ]

  let lowest = dimensions[0]
  for (const dim of dimensions) {
    if (dim.value < lowest.value) {
      lowest = dim
    }
  }
  return lowest
}

// ============================================================
// Claude API helpers
// ============================================================

/**
 * Generate a scope narrative for a given test case using a specific system prompt.
 * Returns the generated scope text. Increments the call counter.
 */
async function generateScope(
  anthropic: Anthropic,
  systemPrompt: string,
  testCase: TestCase,
  callCounter: { count: number }
): Promise<string> {
  callCounter.count++

  const userMessage = buildUserMessage(testCase)

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  // Extract text from response
  const textBlocks = response.content.filter(
    (block): block is Anthropic.TextBlock => block.type === 'text'
  )
  return textBlocks.map((b) => b.text).join('\n')
}

/**
 * Build the user message for scope generation from a test case.
 */
function buildUserMessage(testCase: TestCase): string {
  return `Generate a scope of works for the following inspection:

Property: ${testCase.propertyDescription}
Cause of loss: ${testCase.causeOfLoss}
Affected area: ${testCase.affectedAreaM2} m²
${testCase.damageCategory ? `Damage category: ${testCase.damageCategory}` : ''}
${testCase.damageClass ? `Damage class: ${testCase.damageClass}` : ''}

Produce the full 7-section scope document.`
}

/**
 * Ask Claude to suggest targeted edits to improve the weakest dimension.
 * Returns an array of candidate edits.
 */
async function requestCandidateEdits(
  anthropic: Anthropic,
  currentPrompt: string,
  score: ScopeQualityScore,
  claimType: string,
  candidatesPerIteration: number,
  callCounter: { count: number }
): Promise<CandidateEdit[]> {
  callCounter.count++

  const lowest = findLowestDimension(score)

  const metaPrompt = `You are an IICRC scope prompt engineer. Your task is to improve the system prompt used for generating ${claimType} scope-of-works documents.

Here is the current system prompt:
<current_prompt>
${currentPrompt}
</current_prompt>

Its evaluation scores are:
- Structural: ${score.structural}/100
- Citation density: ${score.citationDensity}/100
- Equipment accuracy: ${score.equipmentAccuracy}/100
- Specificity: ${score.specificity}/100
- Category compliance: ${score.categoryCompliance}/100
- Composite: ${score.composite}/100

The lowest score is "${lowest.name}" at ${lowest.value}/100.

Suggest exactly ${candidatesPerIteration} specific, targeted edits to the system prompt that would improve the "${lowest.name}" score. Each edit should be a concrete text replacement (old text to new text) or addition (empty old text with new text to append).

Constraints:
- Do NOT change the 7-section structure
- Do NOT remove IICRC citation requirements
- Australian English only (metre not meter, vapour not vapor)
- Equipment quantities must always be specific numbers (never "adequate" or "appropriate")
- Edits should be surgical and focused — change as little as possible to maximise the target dimension

Return ONLY a JSON array with exactly ${candidatesPerIteration} objects:
[
  {
    "description": "Brief description of what this edit changes",
    "oldText": "exact text to find in the prompt (empty string if appending)",
    "newText": "replacement text or text to append"
  }
]

Return raw JSON only — no markdown code fences, no commentary.`

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: metaPrompt }],
  })

  const textBlocks = response.content.filter(
    (block): block is Anthropic.TextBlock => block.type === 'text'
  )
  const rawText = textBlocks.map((b) => b.text).join('\n').trim()

  return parseCandidateEdits(rawText, candidatesPerIteration)
}

/**
 * Parse JSON candidate edits from Claude's response.
 * Handles markdown code fences and malformed JSON gracefully.
 */
function parseCandidateEdits(
  rawText: string,
  expectedCount: number
): CandidateEdit[] {
  // Strip markdown code fences if present
  let cleaned = rawText
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim()

  // Attempt to extract JSON array if wrapped in other text
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    cleaned = arrayMatch[0]
  }

  try {
    const parsed = JSON.parse(cleaned) as unknown[]

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .slice(0, expectedCount)
      .filter((item): item is CandidateEdit => {
        if (typeof item !== 'object' || item === null) return false
        const obj = item as Record<string, unknown>
        return (
          typeof obj.description === 'string' &&
          typeof obj.oldText === 'string' &&
          typeof obj.newText === 'string'
        )
      })
  } catch {
    // JSON parse failed — return empty array so the iteration is skipped
    return []
  }
}

/**
 * Apply a candidate edit to a prompt.
 * If oldText is empty, appends newText to the end.
 * If oldText is not found, returns null (edit cannot be applied).
 */
function applyEdit(prompt: string, edit: CandidateEdit): string | null {
  if (edit.oldText === '') {
    // Append mode
    return prompt + '\n' + edit.newText
  }

  if (!prompt.includes(edit.oldText)) {
    return null
  }

  return prompt.replace(edit.oldText, edit.newText)
}

// ============================================================
// Evaluation pipeline
// ============================================================

/**
 * Evaluate a system prompt against a set of test cases.
 * Returns the average composite score across all test cases.
 */
async function evaluatePrompt(
  anthropic: Anthropic,
  systemPrompt: string,
  testCases: TestCase[],
  callCounter: { count: number }
): Promise<{ averageScore: ScopeQualityScore; perCase: ScopeQualityScore[] }> {
  const scores: ScopeQualityScore[] = []

  for (const tc of testCases) {
    const generatedScope = await generateScope(
      anthropic,
      systemPrompt,
      tc,
      callCounter
    )

    const evalInput: ScopeEvaluationInput = {
      claimType: tc.claimType,
      damageCategory: tc.damageCategory ?? undefined,
      damageClass: tc.damageClass ?? undefined,
      affectedAreaM2: tc.affectedAreaM2,
    }

    const score = evaluateScopeQuality(generatedScope, evalInput)
    scores.push(score)
  }

  // Average all dimensions
  const avg: ScopeQualityScore = {
    composite: Math.round(scores.reduce((s, sc) => s + sc.composite, 0) / scores.length),
    structural: Math.round(scores.reduce((s, sc) => s + sc.structural, 0) / scores.length),
    citationDensity: Math.round(scores.reduce((s, sc) => s + sc.citationDensity, 0) / scores.length),
    equipmentAccuracy: Math.round(scores.reduce((s, sc) => s + sc.equipmentAccuracy, 0) / scores.length),
    specificity: Math.round(scores.reduce((s, sc) => s + sc.specificity, 0) / scores.length),
    categoryCompliance: Math.round(scores.reduce((s, sc) => s + sc.categoryCompliance, 0) / scores.length),
    details: {
      sectionsFound: [],
      sectionsMissing: [],
      iicrcRefsCount: 0,
      hedgingWords: [],
      equipmentIssues: [],
    },
  }

  return { averageScore: avg, perCase: scores }
}

// ============================================================
// Public API
// ============================================================

/**
 * Run the prompt optimization loop for a given claim type.
 *
 * The loop:
 *   1. Load production prompt + test cases
 *   2. Establish baseline score
 *   3. Meta-prompt Claude for edits, evaluate each, promote if improved
 *   4. Repeat until budget exhausted
 *
 * Returns full audit trail including all variants tried.
 */
export async function optimizePrompt(
  options: OptimizationOptions
): Promise<OptimizationResult> {
  const {
    claimType,
    budget: rawBudget = 30,
    threshold = 2,
    testCasesPerEval = 3,
    candidatesPerIteration = 3,
  } = options

  // Validate ANTHROPIC_API_KEY
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is not set. ' +
      'Set it in .env.local (dev) or Vercel env vars (prod) to use the prompt optimizer.'
    )
  }

  const budget = Math.min(rawBudget, MAX_BUDGET)
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // ── Step 1: Load current production prompt ──
  let currentPrompt = getClaimTypePrompt(claimType as ClaimType)

  // ── Step 2: Load test cases ──
  const allTestCases = await loadTestCases(claimType)
  if (allTestCases.length === 0) {
    throw new Error(
      `No test cases found for claim type "${claimType}" in scope-examples.json. ` +
      'Add test cases before running optimization.'
    )
  }

  const callCounter = { count: 0 }
  const variants: VariantRecord[] = []
  let versionCounter = 0

  // ── Step 3: Baseline evaluation ──
  const baselineTestCases = sampleTestCases(allTestCases, testCasesPerEval)
  const baselineResult = await evaluatePrompt(
    anthropic,
    currentPrompt,
    baselineTestCases,
    callCounter
  )
  const baselineScore = baselineResult.averageScore.composite

  let bestScore = baselineScore
  let bestPrompt = currentPrompt

  variants.push({
    version: versionCounter++,
    compositeScore: baselineScore,
    description: 'Baseline production prompt',
    promoted: true,
  })

  // ── Step 4: Optimization loop ──
  let iterations = 0

  while (callCounter.count < budget) {
    iterations++

    // 4a. Meta-prompt: get candidate edits
    // Check budget for meta-prompt call (1) + evaluation calls (candidates * testCases)
    const estimatedCallsThisIteration =
      1 + candidatesPerIteration * testCasesPerEval
    if (callCounter.count + estimatedCallsThisIteration > budget) {
      break
    }

    const currentScore = await evaluatePrompt(
      anthropic,
      currentPrompt,
      sampleTestCases(allTestCases, 1), // Quick single-case score for meta-prompt context
      callCounter
    )

    const candidates = await requestCandidateEdits(
      anthropic,
      currentPrompt,
      currentScore.averageScore,
      claimType,
      candidatesPerIteration,
      callCounter
    )

    if (candidates.length === 0) {
      // Meta-prompt returned no valid edits — skip this iteration
      continue
    }

    // 4b–c. Evaluate each candidate
    let bestCandidateScore = bestScore
    let bestCandidatePrompt: string | null = null
    let bestCandidateDescription = ''

    for (const candidate of candidates) {
      if (callCounter.count + testCasesPerEval > budget) {
        break
      }

      const modifiedPrompt = applyEdit(currentPrompt, candidate)
      if (modifiedPrompt === null) {
        // Edit could not be applied (oldText not found)
        variants.push({
          version: versionCounter++,
          compositeScore: 0,
          description: `[SKIPPED] ${candidate.description} — oldText not found in prompt`,
          promoted: false,
        })
        continue
      }

      const evalTestCases = sampleTestCases(allTestCases, testCasesPerEval)
      const evalResult = await evaluatePrompt(
        anthropic,
        modifiedPrompt,
        evalTestCases,
        callCounter
      )

      const candidateComposite = evalResult.averageScore.composite

      variants.push({
        version: versionCounter++,
        compositeScore: candidateComposite,
        description: candidate.description,
        promoted: false, // Will be updated if promoted
      })

      if (candidateComposite > bestCandidateScore) {
        bestCandidateScore = candidateComposite
        bestCandidatePrompt = modifiedPrompt
        bestCandidateDescription = candidate.description
      }
    }

    // 4d. Promote if improvement exceeds threshold
    if (
      bestCandidatePrompt !== null &&
      bestCandidateScore >= bestScore + threshold
    ) {
      currentPrompt = bestCandidatePrompt
      bestScore = bestCandidateScore
      bestPrompt = bestCandidatePrompt

      // Mark the winning variant as promoted
      const winnerVariant = variants.find(
        (v) =>
          v.compositeScore === bestCandidateScore &&
          v.description === bestCandidateDescription &&
          !v.promoted
      )
      if (winnerVariant) {
        winnerVariant.promoted = true
      }
    }
  }

  return {
    claimType,
    iterations,
    totalApiCalls: callCounter.count,
    estimatedCostAud: Math.round(callCounter.count * COST_PER_CALL_AUD * 100) / 100,
    baselineScore,
    bestScore,
    improved: bestScore > baselineScore,
    bestPromptPreview: bestPrompt.slice(0, 200),
    variants,
  }
}
