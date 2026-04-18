/**
 * Scope-stage guards.
 *
 * Board evidence contract (00-board-minutes.md §5.2):
 *
 *  SCOPE_DRAFT → SCOPE_APPROVED (approve_scope)
 *    - Scope row exists for the inspection
 *    - Estimate exists with status=APPROVED + totalIncGST > 0
 *    - ReportApproval exists with status=APPROVED (if created)
 *
 *  SCOPE_APPROVED → VARIATION_REVIEW (raise_variation)
 *  DRYING_ACTIVE → VARIATION_REVIEW (raise_variation)
 *    - At least one ScopeVariation row with status=PENDING
 *
 *  VARIATION_REVIEW → SCOPE_APPROVED (variation_approved)
 *    - The most-recent ScopeVariation has status=APPROVED
 *
 *  VARIATION_REVIEW → SCOPE_DRAFT (variation_rejected)
 *    - The most-recent ScopeVariation has status=REJECTED
 */

import type { PrismaClient } from "@prisma/client";
import type { GuardFn } from "./types";

type Db = Pick<
  PrismaClient,
  "scope" | "estimate" | "scopeVariation" | "reportApproval"
>;

export const approveScopeGuard: GuardFn = async (db, ctx) => {
  const prisma = db as Db;

  // Scope + Estimate are both keyed on reportId in the schema, not inspectionId.
  const [scope, estimate] = await Promise.all([
    prisma.scope.findUnique({
      where: { reportId: ctx.reportId },
      select: { id: true },
    }),
    prisma.estimate.findFirst({
      where: { reportId: ctx.reportId },
      select: { id: true, status: true, totalIncGST: true },
      orderBy: { version: "desc" },
    }),
  ]);

  if (!scope) {
    return {
      passed: false,
      reason: "No Scope row for this report — create a scope first",
      snapshot: {},
    };
  }

  if (!estimate) {
    return {
      passed: false,
      reason:
        "No Estimate for this inspection — estimate required for scope approval",
      snapshot: { scopeId: scope.id },
    };
  }

  if (estimate.status !== "APPROVED") {
    return {
      passed: false,
      reason: `Estimate ${estimate.id} has status=${estimate.status}; must be APPROVED`,
      snapshot: {
        scopeId: scope.id,
        estimateId: estimate.id,
        estimateStatus: estimate.status,
      },
    };
  }

  const totalNum = Number(estimate.totalIncGST);
  if (!Number.isFinite(totalNum) || totalNum <= 0) {
    return {
      passed: false,
      reason: "Estimate total must be greater than zero",
      snapshot: {
        scopeId: scope.id,
        estimateId: estimate.id,
        totalIncGST: totalNum,
      },
    };
  }

  return {
    passed: true,
    snapshot: {
      scopeId: scope.id,
      estimateId: estimate.id,
      estimateStatus: estimate.status,
      totalIncGST: totalNum,
    },
  };
};

export const raiseVariationGuard: GuardFn = async (db, ctx) => {
  if (!ctx.inspectionId) {
    return {
      passed: false,
      reason: "raise_variation requires a linked Inspection",
      snapshot: {},
    };
  }
  const prisma = db as Db;
  const pending = await prisma.scopeVariation.findMany({
    where: { inspectionId: ctx.inspectionId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { id: true, authorisationSource: true, costDeltaCents: true },
  });
  if (pending.length === 0) {
    return {
      passed: false,
      reason: "raise_variation requires a ScopeVariation with status=PENDING",
      snapshot: {},
    };
  }
  if (!pending[0].authorisationSource) {
    return {
      passed: false,
      reason: "ScopeVariation must have authorisationSource captured",
      snapshot: { variation: pending[0] },
    };
  }
  return {
    passed: true,
    snapshot: { variation: pending[0] },
  };
};

export const variationApprovedGuard: GuardFn = async (db, ctx) => {
  if (!ctx.inspectionId) {
    return {
      passed: false,
      reason: "variation_approved requires a linked Inspection",
      snapshot: {},
    };
  }
  const prisma = db as Db;
  const latest = await prisma.scopeVariation.findFirst({
    where: { inspectionId: ctx.inspectionId },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, costDeltaCents: true },
  });
  if (!latest) {
    return {
      passed: false,
      reason: "No ScopeVariation found for this inspection",
      snapshot: {},
    };
  }
  if (latest.status !== "APPROVED") {
    return {
      passed: false,
      reason: `Latest ScopeVariation status=${latest.status}; must be APPROVED`,
      snapshot: { latestVariation: latest },
    };
  }
  return {
    passed: true,
    snapshot: {
      approvedVariationId: latest.id,
      costDeltaCents: latest.costDeltaCents,
    },
  };
};

export const variationRejectedGuard: GuardFn = async (db, ctx) => {
  if (!ctx.inspectionId) {
    return {
      passed: false,
      reason: "variation_rejected requires a linked Inspection",
      snapshot: {},
    };
  }
  const prisma = db as Db;
  const latest = await prisma.scopeVariation.findFirst({
    where: { inspectionId: ctx.inspectionId },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true },
  });
  if (latest?.status !== "REJECTED") {
    return {
      passed: false,
      reason: `Latest ScopeVariation status=${latest?.status ?? "none"}; must be REJECTED`,
      snapshot: { latestVariation: latest },
    };
  }
  return {
    passed: true,
    snapshot: { rejectedVariationId: latest.id },
  };
};
