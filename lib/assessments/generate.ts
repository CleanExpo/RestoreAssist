/**
 * Assessment generation orchestrator — RA-1717.
 *
 * Public entry point for "give me the report + scope + estimate for
 * inspection X under domain Y". Dispatches to a domain plug-in via
 * the registry, persists the result on `AssessmentGeneration`, and
 * returns the typed artefact set.
 *
 * Tenancy: the route handler is responsible for asserting the caller
 * owns the inspection (lib/auth/assert-tenancy.ts). This function
 * trusts the input — it never re-checks permissions beyond what the
 * domain plug-in does internally for its own data dependencies.
 *
 * Budget: AI-using domain plug-ins MUST consult lib/ai/budget-guard
 * before calling Anthropic. The WATER domain is rule-based and skips
 * the guard. Future domains add `costEstimateUsd` to their result so
 * the workspace's daily total accumulates.
 */

import { prisma } from "@/lib/prisma";
import type {
  AssessmentDomain,
  AssessmentGenerationResult,
  GenerationMeta,
} from "./types";
import { getDomainPlugin } from "./registry";
import { enhanceReportProse } from "./ai-prose";

export interface GenerateAssessmentArgs {
  inspectionId: string;
  domain: AssessmentDomain;
  /** Workspace paying for the generation; null for legacy single-user. */
  workspaceId: string | null;
  /** User who triggered the generation — recorded as `generatedBy` for audit. */
  userId: string;
  /** Domain-specific payload (see DomainGenerateInput.options). */
  options?: Record<string, unknown> | null;
  /**
   * When true, after the rule-based plug-in produces the report
   * sections, run them through Claude Haiku to rewrite each body into
   * investigator-grade prose. Standards citations are preserved
   * verbatim. Failures degrade silently to the rule-based output.
   */
  enhanceWithAi?: boolean;
}

export type GenerateAssessmentResult =
  | { ok: true; result: AssessmentGenerationResult; persistedId: string }
  | {
      ok: false;
      status: 400 | 404 | 422 | 429 | 500;
      code: string;
      message: string;
    };

export async function generateAssessment(
  args: GenerateAssessmentArgs,
): Promise<GenerateAssessmentResult> {
  const plugin = getDomainPlugin(args.domain);
  if (!plugin) {
    return {
      ok: false,
      status: 400,
      code: "UNKNOWN_DOMAIN",
      message: `domain ${args.domain} is not registered`,
    };
  }

  const generated = await plugin.generate({
    inspectionId: args.inspectionId,
    workspaceId: args.workspaceId,
    userId: args.userId,
    options: args.options ?? null,
  });

  if (!generated.ok) {
    return {
      ok: false,
      status:
        generated.code === "NOT_FOUND"
          ? 404
          : generated.code === "INSUFFICIENT_DATA"
            ? 422
            : generated.code === "BUDGET_EXCEEDED"
              ? 429
              : 500,
      code: generated.code,
      message: generated.message,
    };
  }

  // Optional AI prose enhancement of the report sections.
  // Never blocks: degrades to rule-based on any failure.
  let reportSections = generated.data.report.sections;
  let proseModel: string | null = generated.data.meta.modelUsed;
  let proseLatencyMs = generated.data.meta.latencyMs;
  let proseCostUsd = generated.data.meta.costEstimateUsd;

  if (args.enhanceWithAi) {
    const proseResult = await enhanceReportProse({
      domain: args.domain,
      sections: reportSections,
      workspaceId: args.workspaceId,
      userId: args.userId,
    });
    reportSections = proseResult.sections;
    if (proseResult.modelUsed) {
      proseModel = proseModel
        ? `${proseModel}+${proseResult.modelUsed}`
        : proseResult.modelUsed;
    }
    if (proseResult.latencyMs !== null) {
      proseLatencyMs = proseLatencyMs + proseResult.latencyMs;
    }
    if (proseResult.costUsd !== null) {
      proseCostUsd = (proseCostUsd ?? 0) + proseResult.costUsd;
    }
  }

  const meta: GenerationMeta = {
    domain: args.domain,
    generatedAt: new Date(),
    modelUsed: proseModel,
    latencyMs: proseLatencyMs,
    costEstimateUsd: proseCostUsd,
    workspaceId: generated.data.meta.workspaceId,
  };

  const result: AssessmentGenerationResult = {
    report: { sections: reportSections },
    scope: generated.data.scope,
    estimate: generated.data.estimate,
    citations: generated.data.citations,
    meta,
  };

  // Persist for audit + cache. Failure to persist must NOT lose the
  // generated content — surface a 500 with the result still attached.
  try {
    const row = await prisma.assessmentGeneration.create({
      data: {
        inspectionId: args.inspectionId,
        assessmentType: args.domain,
        // Json fields — Prisma takes plain object/array literals.
        reportSections: result.report.sections as object,
        scopeItems: result.scope.items as object,
        estimateLines: result.estimate.lines as object,
        citations: result.citations as object,
        modelUsed: meta.modelUsed,
        latencyMs: meta.latencyMs,
        costEstimateUsd: meta.costEstimateUsd,
        workspaceId: meta.workspaceId,
        generatedById: args.userId,
      },
      select: { id: true },
    });
    return { ok: true, result, persistedId: row.id };
  } catch (err) {
    console.error("[assessments.generate] persistence failed", err);
    return {
      ok: false,
      status: 500,
      code: "PERSISTENCE_FAILED",
      message: "Generated artefacts could not be persisted",
    };
  }
}
