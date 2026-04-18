/**
 * Stabilisation-stage guards.
 *
 * Board evidence contract (00-board-minutes.md §5.2):
 *
 *  STABILISATION_ACTIVE → STABILISATION_COMPLETE (attest_stabilisation)
 *    - All applicable MakeSafeAction rows closed (completed=true) OR
 *      explicitly applicable=false
 *    - SwmsDraft.signedAt not null
 *    - No open HIGH/CRITICAL WHSIncident on the inspection
 *
 *  STABILISATION_ACTIVE → WHS_HOLD (whs_incident_raised)
 *    - At least one HIGH/CRITICAL WHSIncident with status=OPEN
 *
 *  WHS_HOLD → STABILISATION_ACTIVE (whs_cleared)
 *    - No open HIGH/CRITICAL WHSIncident
 */

import type { PrismaClient } from "@prisma/client";
import type { GuardFn } from "./types";

type Db = Pick<PrismaClient, "makeSafeAction" | "swmsDraft" | "wHSIncident">;

export const attestStabilisationGuard: GuardFn = async (db, ctx) => {
  if (!ctx.inspectionId) {
    return {
      passed: false,
      reason: "attest_stabilisation requires a linked Inspection",
      snapshot: { reason: "no_inspection" },
    };
  }
  const prisma = db as Db;

  const [makeSafe, swms, whs] = await Promise.all([
    prisma.makeSafeAction.findMany({
      where: { inspectionId: ctx.inspectionId },
      select: {
        id: true,
        action: true,
        completed: true,
        applicable: true,
      },
    }),
    prisma.swmsDraft.findFirst({
      where: { inspectionId: ctx.inspectionId },
      select: { id: true, signedAt: true },
    }),
    prisma.wHSIncident.findMany({
      where: {
        inspectionId: ctx.inspectionId,
        severity: { in: ["HIGH", "CRITICAL"] },
        status: "OPEN",
      },
      select: { id: true, severity: true },
    }),
  ]);

  const unsafe = makeSafe.filter((m) => m.applicable && !m.completed);
  if (unsafe.length > 0) {
    return {
      passed: false,
      reason: `Applicable MakeSafeAction(s) not completed: ${unsafe
        .map((m) => m.action)
        .join(", ")}`,
      snapshot: { unclosed: unsafe, makeSafeCount: makeSafe.length },
    };
  }

  if (!swms?.signedAt) {
    return {
      passed: false,
      reason: "SwmsDraft must be signed before stabilisation attestation",
      snapshot: { swms: swms ?? null },
    };
  }

  if (whs.length > 0) {
    return {
      passed: false,
      reason: `${whs.length} open HIGH/CRITICAL WHSIncident(s) must be resolved first`,
      snapshot: { openWhsIncidents: whs },
    };
  }

  return {
    passed: true,
    snapshot: {
      makeSafeActions: makeSafe.map((m) => ({
        id: m.id,
        action: m.action,
        completed: m.completed,
        applicable: m.applicable,
      })),
      swmsId: swms.id,
      swmsSignedAt: swms.signedAt,
      openWhsIncidents: 0,
    },
  };
};

export const whsIncidentRaisedGuard: GuardFn = async (db, ctx) => {
  if (!ctx.inspectionId) {
    return {
      passed: false,
      reason: "whs_incident_raised requires a linked Inspection",
      snapshot: {},
    };
  }
  const prisma = db as Db;
  const open = await prisma.wHSIncident.findMany({
    where: {
      inspectionId: ctx.inspectionId,
      severity: { in: ["HIGH", "CRITICAL"] },
      status: "OPEN",
    },
    select: { id: true, severity: true },
  });
  if (open.length === 0) {
    return {
      passed: false,
      reason:
        "whs_incident_raised requires at least one open HIGH/CRITICAL WHSIncident on this inspection",
      snapshot: {},
    };
  }
  return {
    passed: true,
    snapshot: { openWhsIncidents: open },
  };
};

export const whsClearedGuard: GuardFn = async (db, ctx) => {
  if (!ctx.inspectionId) {
    return {
      passed: false,
      reason: "whs_cleared requires a linked Inspection",
      snapshot: {},
    };
  }
  const prisma = db as Db;
  const stillOpen = await prisma.wHSIncident.findMany({
    where: {
      inspectionId: ctx.inspectionId,
      severity: { in: ["HIGH", "CRITICAL"] },
      status: "OPEN",
    },
    select: { id: true, severity: true },
  });
  if (stillOpen.length > 0) {
    return {
      passed: false,
      reason: `Cannot clear WHS hold — ${stillOpen.length} HIGH/CRITICAL incident(s) remain OPEN`,
      snapshot: { stillOpen },
    };
  }
  return {
    passed: true,
    snapshot: { clearedAt: new Date().toISOString() },
  };
};
