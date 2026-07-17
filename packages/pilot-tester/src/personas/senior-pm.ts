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
  /** Raw output for the report. */
  raw: unknown;
}

export interface SeniorPMOptions {
  inspectionId: string;
}

export async function reviewByAdjuster(
  opts: SeniorPMOptions,
): Promise<AdjusterReview | null> {
  let runAdjusterAgent:
    | ((id: string) => Promise<{
        recommendation: AdjusterReview["recommendation"];
        findings: { severity: string }[];
        costReasonableness: AdjusterReview["costReasonableness"];
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
    const out = await runAdjusterAgent(opts.inspectionId);
    return {
      recommendation: out.recommendation,
      findingCount: out.findings.length,
      criticalFindings: out.findings.filter((f) => f.severity === "critical")
        .length,
      costReasonableness: out.costReasonableness,
      raw: out,
    };
  } catch {
    return null;
  }
}
