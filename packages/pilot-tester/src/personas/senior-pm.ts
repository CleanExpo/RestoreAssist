/**
 * Senior-PM persona wrapper.
 *
 * Wraps the existing `lib/ai/adjuster-agent.ts` with a thin contract
 * the runner can call once per generated assessment. We don't import
 * `runAdjusterAgent` at module load time — it pulls in Prisma + the
 * AI dispatch layer, both of which would explode at module-init in
 * a sandboxed harness without DB credentials. Lazy-load instead so
 * the harness can no-op gracefully when the adjuster path is
 * unavailable.
 */

export interface AdjusterReview {
  recommendation: "approve" | "query-contractor" | "escalate";
  findingCount: number;
  criticalFindings: number;
  costReasonableness: "within-range" | "high" | "low";
  inspectionId: string;
  generationId: string;
  assessmentSha256: string;
  costUsd: number;
  failedAttemptCostUsd: number;
  /** Raw output for the report. */
  raw: unknown;
}

export interface SeniorPMOptions {
  inspectionId: string;
  generationId: string;
  assessmentSha256: string;
  workspaceId: string;
  actorUserId: string;
}

export async function reviewByAdjuster(
  opts: SeniorPMOptions,
): Promise<AdjusterReview | null> {
  let runAdjusterAgent:
    | ((id: string, binding?: {
        assessmentGenerationId: string;
        assessmentSha256: string;
        workspaceId: string;
        actorUserId: string;
      }) => Promise<{
        recommendation: AdjusterReview["recommendation"];
        findings: { severity: string }[];
        costReasonableness: AdjusterReview["costReasonableness"];
        inspectionId: string;
        assessmentGenerationId?: string;
        assessmentSha256?: string;
        costUsd?: number;
        failedAttemptCostUsd?: number;
      }>)
    | null = null;
  try {
    // Lazy import — only needed when running locally with DB access.
    const mod = await import("@/lib/ai/adjuster-agent");
    runAdjusterAgent = mod.runAdjusterAgent;
  } catch {
    return null;
  }

  if (!runAdjusterAgent) return null;

  try {
    const out = await runAdjusterAgent(opts.inspectionId, {
      assessmentGenerationId: opts.generationId,
      assessmentSha256: opts.assessmentSha256,
      workspaceId: opts.workspaceId,
      actorUserId: opts.actorUserId,
    });
    if (
      out.inspectionId !== opts.inspectionId ||
      out.assessmentGenerationId !== opts.generationId ||
      out.assessmentSha256 !== opts.assessmentSha256 ||
      typeof out.costUsd !== "number" ||
      !Number.isFinite(out.costUsd) ||
      out.costUsd < 0 ||
      typeof out.failedAttemptCostUsd !== "number" ||
      !Number.isFinite(out.failedAttemptCostUsd) ||
      out.failedAttemptCostUsd < 0
    ) {
      // The current application adjuster does not yet provide these receipts.
      // Returning null deliberately blocks release evidence rather than claiming
      // it reviewed the generated assessment or accounting for unknown spend.
      return null;
    }
    return {
      recommendation: out.recommendation,
      findingCount: out.findings.length,
      criticalFindings: out.findings.filter((f) => f.severity === "critical")
        .length,
      costReasonableness: out.costReasonableness,
      inspectionId: out.inspectionId,
      generationId: out.assessmentGenerationId,
      assessmentSha256: out.assessmentSha256,
      costUsd: out.costUsd,
      failedAttemptCostUsd: out.failedAttemptCostUsd,
      raw: out,
    };
  } catch {
    return null;
  }
}
