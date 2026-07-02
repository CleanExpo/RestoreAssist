/**
 * TEST-ONLY route — upserts an Inspection owned by the currently signed-in
 * test user. The three tech-* specs navigate to
 * /dashboard/inspections/test-inspection and need the row to exist with a
 * status that lets InspectionSignOff render.
 *
 * HARD GUARD — returns 404 unless ALLOW_TEST_HELPERS === "true".
 *
 * Body (all optional):
 *   - inspectionId  (string)  — defaults to "test-inspection" (stable ID for E2E).
 *   - status        (string)  — InspectionStatus enum value. Defaults to "COMPLETED".
 *                                Ignored when `readyForClose=true` (forced IN_BILLING).
 *   - source        (string)  — Stamps Inspection.source (e.g. "DR_NRPG").
 *   - acceptedAt    (string|null) — Sets Inspection.acceptedAt; null leaves unset.
 *   - readyForClose (boolean) — When true, ALSO upserts a linked Report
 *                                (status=COMPLETED), Invoice (status=PAID) and
 *                                ClaimProgress so the SP-A close-route gate
 *                                `canTransition(IN_BILLING → CLOSED)` passes.
 *                                Inspection is forced to status=IN_BILLING.
 *                                Deterministic IDs derived from inspectionId
 *                                (e.g. `${inspectionId}-report`) — reruns are
 *                                idempotent and produce no duplicates.
 *
 * Returns: { inspectionId: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";
import type { InspectionStatus } from "@prisma/client";

interface SeedBody {
  inspectionId?: string;
  status?: InspectionStatus;
  /** When set (e.g. "DR_NRPG"), stamps Inspection.source so the
   *  dashboard <InboundJobAlert> picks the row up. */
  source?: string;
  /** When provided, sets Inspection.acceptedAt explicitly (use null to
   *  leave unset for the alert-pending state). */
  acceptedAt?: string | null;
  /** SP-A close-gate seed. See file header. */
  readyForClose?: boolean;
}

export async function POST(req: NextRequest) {
  // Vercel preview deploys run with NODE_ENV=production, so we cannot use
  // NODE_ENV to gate. The sandbox Vercel project sets ALLOW_TEST_HELPERS=true;
  // prod does not. Local dev sets it via .env.local for the E2E suite to work.
  if (process.env.ALLOW_TEST_HELPERS !== "true") {
    return apiError(req, {
      code: "NOT_FOUND",
      message: "Test helpers are not enabled in this environment",
      status: 404,
    });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(req, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  let body: SeedBody;
  try {
    body = (await req.json()) as SeedBody;
  } catch {
    body = {};
  }

  const id = body.inspectionId ?? "test-inspection";
  // When readyForClose=true the close route requires status=IN_BILLING for
  // the CAS in /api/inspections/[id]/close. Caller override is ignored in
  // that branch (documented above).
  const status: InspectionStatus = body.readyForClose
    ? "IN_BILLING"
    : (body.status ?? "COMPLETED");
  // Derived from id so reruns of the same seed don't collide on the unique
  // inspectionNumber constraint (the upsert key is `id`, not inspectionNumber).
  const inspectionNumber = `TEST-${id}`;

  const extraCreate: Record<string, unknown> = {};
  const extraUpdate: Record<string, unknown> = {};
  if (typeof body.source === "string") {
    extraCreate.source = body.source;
    extraUpdate.source = body.source;
  }
  if (body.acceptedAt !== undefined) {
    extraCreate.acceptedAt = body.acceptedAt ? new Date(body.acceptedAt) : null;
    extraUpdate.acceptedAt = body.acceptedAt ? new Date(body.acceptedAt) : null;
  }

  // SP-A close-gate seed: create the linked Report + Invoice + ClaimProgress
  // BEFORE the Inspection upsert so we can FK-link the Inspection to the
  // Report (Inspection.reportId is the lookup path for loadTransitionContext).
  // Deterministic IDs keyed off `id` make every rerun a no-op.
  if (body.readyForClose) {
    const reportId = `${id}-report`;
    const invoiceId = `${id}-invoice`;
    const progressId = `${id}-progress`;
    const invoiceNumber = `TEST-${id}-INV`;

    // Report — status COMPLETED is the state machine's `report_sent` gate.
    // (ReportStatus enum has no "SENT" today; "COMPLETED" is the terminal value.)
    await prisma.report.upsert({
      where: { id: reportId },
      create: {
        id: reportId,
        title: `Test Report ${id}`,
        clientName: "Test Client",
        propertyAddress: "1 Test St, Testville QLD 4000",
        hazardType: "WATER",
        insuranceType: "BUILDING",
        status: "COMPLETED",
        userId: session.user.id,
      },
      update: { status: "COMPLETED" },
      select: { id: true },
    });

    // Invoice — status PAID is the state machine's `invoice_paid` gate.
    // Invoice is FK'd to the Report (loadTransitionContext looks up by reportId).
    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await prisma.invoice.upsert({
      where: { id: invoiceId },
      create: {
        id: invoiceId,
        invoiceNumber,
        status: "PAID",
        dueDate,
        customerName: "Test Client",
        customerEmail: "test@example.com",
        subtotalExGST: 100000,
        gstAmount: 10000,
        totalIncGST: 110000,
        amountPaid: 110000,
        amountDue: 0,
        paidDate: new Date(),
        reportId,
        userId: session.user.id,
      },
      update: {
        status: "PAID",
        amountPaid: 110000,
        amountDue: 0,
        paidDate: new Date(),
      },
      select: { id: true },
    });

    // ClaimProgress — anchored on inspectionId so the close route's
    // `claimProgress.updateMany({ where: { inspectionId } })` mirror hits.
    // ClaimProgress.reportId is required (@unique 1:1 with Report).
    await prisma.claimProgress.upsert({
      where: { id: progressId },
      create: {
        id: progressId,
        reportId,
        inspectionId: id,
        currentState: "INVOICE_ISSUED",
      },
      update: {
        inspectionId: id,
        currentState: "INVOICE_ISSUED",
      },
      select: { id: true },
    });

    extraCreate.reportId = reportId;
    extraUpdate.reportId = reportId;
  }

  const inspection = await prisma.inspection.upsert({
    where: { id },
    create: {
      id,
      inspectionNumber,
      propertyAddress: "1 Test St, Testville QLD 4000",
      propertyPostcode: "4000",
      status,
      userId: session.user.id,
      ...(extraCreate as any),
    },
    update: { status, ...(extraUpdate as any) },
    select: { id: true },
  });

  return NextResponse.json({ inspectionId: inspection.id });
}
