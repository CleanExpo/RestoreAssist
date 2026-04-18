/**
 * Drying-stage guards.
 *
 * Board evidence contract (00-board-minutes.md §5.2):
 *
 *  DRYING_ACTIVE → DRYING_CERTIFIED (certify_drying)
 *    - DryingGoalRecord.goalAchieved = true AND signedOffBy set
 *    - At least one MoistureReading with isBaseline = true (unaffected baseline)
 *    - At least one MoistureReading with isMonitoringPoint = true
 *
 *  SCOPE_APPROVED → DRYING_ACTIVE (commence_drying)
 *    - Minimal guard; drying start doesn't need heavy evidence
 */

import type { PrismaClient } from "@prisma/client";
import type { GuardFn } from "./types";

type Db = Pick<PrismaClient, "dryingGoalRecord" | "moistureReading">;

export const commenceDryingGuard: GuardFn = async (_db, _ctx) => {
  // No DB evidence requirement. The state-machine edge from SCOPE_APPROVED
  // is the gate; carrier authority + scope approval have already been
  // verified upstream in approve_scope.
  return {
    passed: true,
    snapshot: { commencedAt: new Date().toISOString() },
  };
};

export const certifyDryingGuard: GuardFn = async (db, ctx) => {
  if (!ctx.inspectionId) {
    return {
      passed: false,
      reason: "certify_drying requires a linked Inspection",
      snapshot: {},
    };
  }
  const prisma = db as Db;

  const [goalRecord, baselineCount, monitoringCount] = await Promise.all([
    prisma.dryingGoalRecord.findFirst({
      where: { inspectionId: ctx.inspectionId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        goalAchieved: true,
        signedOffBy: true,
        signedOffAt: true,
      },
    }),
    prisma.moistureReading.count({
      where: { inspectionId: ctx.inspectionId, isBaseline: true },
    }),
    prisma.moistureReading.count({
      where: { inspectionId: ctx.inspectionId, isMonitoringPoint: true },
    }),
  ]);

  if (!goalRecord) {
    return {
      passed: false,
      reason: "No DryingGoalRecord for this inspection — cannot certify",
      snapshot: {},
    };
  }
  if (!goalRecord.goalAchieved) {
    return {
      passed: false,
      reason: "DryingGoalRecord.goalAchieved=false — drying standard not met",
      snapshot: { goalRecordId: goalRecord.id },
    };
  }
  if (!goalRecord.signedOffBy) {
    return {
      passed: false,
      reason: "DryingGoalRecord must be signed off by a senior technician",
      snapshot: { goalRecordId: goalRecord.id },
    };
  }
  if (baselineCount === 0) {
    return {
      passed: false,
      reason:
        "At least one baseline (unaffected-area) MoistureReading required — Ops Director §3",
      snapshot: { goalRecordId: goalRecord.id, baselineCount: 0 },
    };
  }
  if (monitoringCount === 0) {
    return {
      passed: false,
      reason:
        "At least one monitoring-point MoistureReading required — Ops Director §3",
      snapshot: {
        goalRecordId: goalRecord.id,
        baselineCount,
        monitoringCount: 0,
      },
    };
  }

  return {
    passed: true,
    snapshot: {
      goalRecordId: goalRecord.id,
      signedOffBy: goalRecord.signedOffBy,
      signedOffAt: goalRecord.signedOffAt,
      baselineCount,
      monitoringCount,
    },
  };
};
