/**
 * Three-layer grader.
 *
 * (a) Deterministic — `evaluateScopeQuality()` from the existing
 *     library. Runs offline, no AI calls.
 * (b) LLM judge — repurposes the evaluation harness's scorer prompt.
 *     Optional; skipped if no AI key + no self-hosted route is
 *     reachable. Failures degrade to null.
 * (c) Adjuster persona — `runAdjusterAgent()` invoked via
 *     `personas/senior-pm.ts`. Optional; skipped if Prisma can't
 *     reach a DB.
 *
 * Aggregates into a stable `GradedAssessment` for the reporter.
 */

import type { GenerateAssessmentOutput } from "../client/api-client.js";
import {
  reviewByAdjuster,
  type AdjusterReview,
} from "../personas/senior-pm.js";
import type { JudgeScore } from "./judge.js";
import { sha256Json } from "./evidence.js";

export interface DeterministicScore {
  composite: number;
  structural: number;
  citations: number;
  equipment: number;
  specificity: number;
  category: number;
}

export interface GradedAssessment {
  inspectionId: string;
  domain: string;
  generationId: string;
  /** SHA-256 of the exact generated assessment that all graders received. */
  assessmentSha256: string;
  modelUsed: string | null;
  latencyMs: number;
  costEstimateUsd: number | null;
  deterministic: DeterministicScore | null;
  adjuster: AdjusterReview | null;
  judge: JudgeScore | null;
  /** True if every grading layer ran successfully. */
  fullyGraded: boolean;
}

export interface GradingOptions {
  inspectionId: string;
  workspaceId: string;
  actorUserId: string;
  generated: GenerateAssessmentOutput;
  /** Server-owned judge receipt. Direct harness judging is intentionally
   * forbidden because it cannot be reconciled against a reservation. */
  judge: Promise<JudgeScore | null>;
}

export async function gradeAssessment(
  opts: GradingOptions,
): Promise<GradedAssessment> {
  const assessmentSha256 = sha256Json(opts.generated);
  // All three layers run in parallel — they don't share state and the
  // network-bound ones (adjuster + judge) hide their own latency
  // behind the deterministic call, which is offline.
  const [det, adj, jud] = await Promise.all([
    runDeterministic(opts.generated),
    reviewByAdjuster({
      inspectionId: opts.inspectionId,
      workspaceId: opts.workspaceId,
      actorUserId: opts.actorUserId,
      generationId: opts.generated.assessmentGenerationId,
      assessmentSha256,
    }),
    opts.judge,
  ]);

  return {
    inspectionId: opts.inspectionId,
    domain: opts.generated.meta.domain,
    generationId: opts.generated.assessmentGenerationId,
    assessmentSha256,
    modelUsed: opts.generated.meta.modelUsed,
    latencyMs: opts.generated.meta.latencyMs,
    costEstimateUsd: opts.generated.meta.costEstimateUsd,
    deterministic: det,
    adjuster: adj,
    judge: jud,
    fullyGraded: det !== null && adj !== null && jud !== null,
  };
}

async function runDeterministic(
  generated: GenerateAssessmentOutput,
): Promise<DeterministicScore | null> {
  // The existing scope-quality-evaluator scores a free-text scope
  // string. Stitch the report-section bodies + scope-item lines into
  // one string so the deterministic checker has substrate to score.
  const stitched = [
    ...generated.report.sections.map(
      (s) =>
        `## ${s.heading}\n${s.body}${s.citations ? "\n" + s.citations.map((c) => `${c.standard} ${c.section}`).join(" · ") : ""}`,
    ),
    "## Scope items",
    ...generated.scope.items.map(
      (item) =>
        `- ${item.description} (qty ${item.quantity} ${item.unit})${item.iicrcRef ? " · " + item.iicrcRef : ""}`,
    ),
  ].join("\n\n");

  // Lazy import — same reason as senior-pm.ts.
  type ScoreShape = {
    composite: number;
    structural: number;
    citationDensity: number;
    equipmentAccuracy: number;
    specificity: number;
    categoryCompliance: number;
  };
  let evaluateScopeQuality:
    | ((scope: string, input: { claimType: string }) => ScoreShape)
    | null = null;
  try {
    const mod = (await import("@/lib/ai/scope-quality-evaluator")) as {
      evaluateScopeQuality: (
        scope: string,
        input: { claimType: string },
      ) => ScoreShape;
    };
    evaluateScopeQuality = mod.evaluateScopeQuality;
  } catch {
    return null;
  }
  if (!evaluateScopeQuality) return null;

  try {
    const r = evaluateScopeQuality(stitched, {
      claimType: generated.meta.domain.toLowerCase(),
    });
    return {
      composite: r.composite,
      structural: r.structural,
      citations: r.citationDensity,
      equipment: r.equipmentAccuracy,
      specificity: r.specificity,
      category: r.categoryCompliance,
    };
  } catch {
    return null;
  }
}
