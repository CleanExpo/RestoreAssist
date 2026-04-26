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

export interface GenerateAssessmentArgs {
  inspectionId: string;
  domain: AssessmentDomain;
  /** Workspace paying for the generation; null for legacy single-user. */
  workspaceId: string | null;
  /** User who triggered the generation — recorded as `generatedBy` for audit. */
  userId: string;
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

  const meta: GenerationMeta = {
    domain: args.domain,
    generatedAt: new Date(),
    modelUsed: generated.data.meta.modelUsed,
    latencyMs: generated.data.meta.latencyMs,
    costEstimateUsd: generated.data.meta.costEstimateUsd,
    workspaceId: generated.data.meta.workspaceId,
  };

  const result: AssessmentGenerationResult = {
    report: generated.data.report,
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
