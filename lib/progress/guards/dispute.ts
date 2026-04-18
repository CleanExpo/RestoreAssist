/**
 * Dispute and termination guards.
 *
 * Board evidence contract (00-board-minutes.md §5.2):
 *
 *  INVOICE_ISSUED → DISPUTED (raise_dispute)
 *    - Evidence not checked at this layer (API-route enforces
 *      disputeReason ≥ 20 chars + EvidenceItem reference). Guard just
 *      confirms the state transition is valid.
 *
 *  DISPUTED → INVOICE_ISSUED (dispute_resolved)
 *    - No DB gate — lawyer/admin-only transition enforced by permissions.
 *
 *  DISPUTED → WITHDRAWN (write_off)
 *    - No DB gate — admin-only terminal decision.
 *
 *  INVOICE_PAID → CLOSED (close_claim)
 *    - Invoice status must be PAID (belt-and-braces check over invoice guard)
 *    - No open WHSIncident HIGH/CRITICAL
 *    - No PENDING ScopeVariation
 *
 *  any non-terminal → WITHDRAWN (withdraw)
 *    - State-machine already enforces NON_WITHDRAWABLE_STATES; no DB gate.
 */

import type { PrismaClient } from "@prisma/client";
import type { GuardFn } from "./types";

type Db = Pick<PrismaClient, "invoice" | "scopeVariation" | "wHSIncident">;

export const raiseDisputeGuard: GuardFn = async (_db, _ctx) => {
  // Evidence + reason enforced at API layer (min 20 char reason +
  // EvidenceItem reference). Guard is a pass-through so the service
  // layer records the transition with an empty snapshot.
  return { passed: true, snapshot: { gate: "api_layer" } };
};

export const disputeResolvedGuard: GuardFn = async (_db, _ctx) => {
  return { passed: true, snapshot: { gate: "permissions_only" } };
};

export const writeOffGuard: GuardFn = async (_db, _ctx) => {
  return { passed: true, snapshot: { gate: "admin_only_decision" } };
};

export const closeClaimGuard: GuardFn = async (db, ctx) => {
  const prisma = db as Db;

  const invoice = await prisma.invoice.findFirst({
    where: { reportId: ctx.reportId },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, amountDue: true },
  });

  if (!invoice || invoice.status !== "PAID") {
    return {
      passed: false,
      reason: `Invoice must be PAID before claim can close (current: ${invoice?.status ?? "none"})`,
      snapshot: { invoiceId: invoice?.id, status: invoice?.status },
    };
  }

  if (!ctx.inspectionId) {
    // Without an inspection link we can't check WHS/variations — allow
    // close given invoice is PAID, but note the gap.
    return {
      passed: true,
      snapshot: {
        invoiceId: invoice.id,
        status: invoice.status,
        note: "no_inspection_linked",
      },
    };
  }

  const [pendingVariations, openWhs] = await Promise.all([
    prisma.scopeVariation.count({
      where: { inspectionId: ctx.inspectionId, status: "PENDING" },
    }),
    prisma.wHSIncident.count({
      where: {
        inspectionId: ctx.inspectionId,
        severity: { in: ["HIGH", "CRITICAL"] },
        status: "OPEN",
      },
    }),
  ]);

  if (pendingVariations > 0) {
    return {
      passed: false,
      reason: `${pendingVariations} PENDING ScopeVariation(s) must be resolved before claim close`,
      snapshot: { invoiceId: invoice.id, pendingVariations },
    };
  }
  if (openWhs > 0) {
    return {
      passed: false,
      reason: `${openWhs} open HIGH/CRITICAL WHSIncident(s) must be resolved before claim close`,
      snapshot: { invoiceId: invoice.id, openWhs },
    };
  }

  return {
    passed: true,
    snapshot: {
      invoiceId: invoice.id,
      status: invoice.status,
      pendingVariations: 0,
      openWhs: 0,
    },
  };
};

export const withdrawGuard: GuardFn = async (_db, _ctx) => {
  // State machine already enforces NON_WITHDRAWABLE_STATES. Admin-only
  // via permissions. No evidence gate.
  return { passed: true, snapshot: { gate: "state_machine_and_permissions" } };
};
