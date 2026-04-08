/**
 * Types for fan-out parallel sessions and evaluator scoring.
 * These fields are stored as JSON in the Report.detailedReport metadata
 * and surfaced through the reports API. All fields are optional to allow
 * graceful rendering when data is not yet present.
 */

export type PhaseId = 1 | 2 | 3 | 4 | 5 | 6 | 7

export interface PhaseProgress {
  /** Phase number (1–7) */
  phase: PhaseId
  /** Human-readable phase label */
  label: string
  /** Whether the phase has completed successfully */
  completed: boolean
  /** Optional ISO timestamp when the phase finished */
  completedAt?: string
}

export const PHASE_LABELS: Record<PhaseId, string> = {
  1: "Input Ingestion",
  2: "Site Analysis",
  3: "Scope Generation",
  4: "Cost Estimation",
  5: "Compliance Check",
  6: "Report Assembly",
  7: "Evaluator Review",
}

/** One dimension of the evaluator's quality assessment */
export interface EvaluatorDimension {
  /** Raw score 0–100 */
  score: number
  /** Brief evaluator feedback for this dimension */
  feedback?: string
}

/** Four-dimension evaluator score breakdown attached to each generation session */
export interface EvaluatorScores {
  /** Technical accuracy of the generated content */
  accuracy: EvaluatorDimension
  /** Completeness — all required sections present */
  completeness: EvaluatorDimension
  /** Compliance with IICRC S500 standards */
  compliance: EvaluatorDimension
  /** Clarity and professional language */
  clarity: EvaluatorDimension
  /** Whether the evaluator triggered a retry */
  retriedAt?: string
  /** Number of evaluator-triggered retries (0 if none) */
  retryCount?: number
}

/** A single fan-out child session spawned during parallel generation */
export interface FanOutSession {
  /** Unique session identifier */
  sessionId: string
  /** Which report section this child session generated */
  section: string
  /** Session status */
  status: "pending" | "running" | "completed" | "failed" | "retrying"
  /** Evaluator scores for this child session, if evaluation has run */
  evaluatorScores?: EvaluatorScores
  /** Phase progress for this child session */
  phases?: PhaseProgress[]
  /** ISO timestamp when the session started */
  startedAt?: string
  /** ISO timestamp when the session completed */
  completedAt?: string
}

/** Extended report shape that includes session orchestration metadata */
export interface ReportWithSessionData {
  id: string
  title: string
  clientName: string
  propertyAddress: string
  waterCategory?: string | null
  waterClass?: string | null
  status: string
  reportNumber?: string | null
  createdAt: string
  updatedAt: string
  totalCost?: number | null
  estimatedCost?: number | null

  insuranceType?: string | null
  policyType?: string | null

  // --- Session orchestration fields (optional, absent on older reports) ---

  /** The parent session ID that orchestrated this report's generation */
  parentSessionId?: string

  /** Overall phase progress for the top-level generation session */
  phases?: PhaseProgress[]

  /** Evaluator scores for the top-level session */
  evaluatorScores?: EvaluatorScores

  /** Child sessions spawned via fan-out for parallel section generation */
  fanOutSessions?: FanOutSession[]
}

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

/** Returns a 0–100 aggregate score across all four evaluator dimensions */
export function aggregateEvaluatorScore(scores: EvaluatorScores): number {
  const { accuracy, completeness, compliance, clarity } = scores
  return Math.round(
    (accuracy.score + completeness.score + compliance.score + clarity.score) / 4
  )
}

/** Returns the number of completed phases out of total */
export function countCompletedPhases(phases: PhaseProgress[]): { completed: number; total: number } {
  return {
    completed: phases.filter((p) => p.completed).length,
    total: phases.length,
  }
}

/** Colour class for an evaluator score value */
export function scoreColour(score: number): string {
  if (score >= 85) return "text-emerald-400"
  if (score >= 70) return "text-amber-400"
  return "text-red-400"
}

/** Background colour class for an evaluator score value */
export function scoreBgColour(score: number): string {
  if (score >= 85) return "bg-emerald-500/20"
  if (score >= 70) return "bg-amber-500/20"
  return "bg-red-500/20"
}
