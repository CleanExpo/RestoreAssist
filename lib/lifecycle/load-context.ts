/**
 * SP-A Task 7 — Hydrate a TransitionContext for the inspection state machine.
 *
 * Extracted from the close route so SP-B's webhook subscribers
 * (lib/lifecycle/subscribers/*) can reuse the same hydration logic without
 * round-tripping through HTTP.
 *
 * Plan ref: docs/superpowers/plans/2026-05-14-sp-a-job-close.md Task 7 step 3.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import type { TransitionContext } from "./inspection-state-machine";

/**
 * Pulls the minimal data needed to evaluate canTransition for the given
 * inspection: latest invoice status, report status, handover timestamp.
 * Uses a single Prisma query with explicit select (rule 4).
 *
 * Accepts a `PrismaClient` or `Prisma.TransactionClient` so it composes
 * with the close route's `$transaction` boundary.
 */
export async function loadTransitionContext(
  db: PrismaClient | Prisma.TransactionClient,
  inspectionId: string,
): Promise<TransitionContext> {
  const inspection = await db.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      handoverCompletedAt: true,
      reportId: true,
      report: { select: { status: true } },
    },
  });

  // Invoice lookup is by inspection's report. Fall back to null if no
  // invoice/report yet — the state machine will treat null as "not paid".
  let invoiceStatus: TransitionContext["invoiceStatus"] = null;
  if (inspection?.reportId) {
    const invoice = await db.invoice.findFirst({
      where: { reportId: inspection.reportId },
      orderBy: { invoiceDate: "desc" },
      select: { status: true },
    });
    if (invoice) {
      invoiceStatus = invoice.status as TransitionContext["invoiceStatus"];
    }
  }

  return {
    invoiceStatus,
    reportStatus:
      (inspection?.report?.status as TransitionContext["reportStatus"]) ?? null,
    handoverCompletedAt: inspection?.handoverCompletedAt ?? null,
  };
}
