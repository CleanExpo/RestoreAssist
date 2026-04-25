/**
 * POST /api/claims/handover-to-insurer
 *
 * Freezes further claim edits and notifies the insurer that a fully-scoped
 * claim package is ready for review.
 *
 * Body: { inspectionId: string, insurerEmail?: string, portalLink?: string }
 *
 * Side effects:
 *   - Inspection.status → SUBMITTED
 *   - ClaimProgress.currentState → SCOPE_APPROVED (if linked; otherwise skipped)
 *   - Sends email to insurerEmail (or inspection.insurerEmail if set on Inspection)
 *
 * P1-CLAIM3 — RA-1129
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email-send";
import { domainEvents } from "@/lib/events/emitter";
import { writeInspectionAudit } from "@/lib/inspection-audit";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { inspectionId?: string; insurerEmail?: string; portalLink?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { inspectionId } = body;
  if (!inspectionId) {
    return NextResponse.json({ error: "inspectionId is required" }, { status: 400 });
  }

  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      userId: true,
      status: true,
      propertyAddress: true,
      inspectionNumber: true,
    },
  });

  if (!inspection) {
    return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
  }
  if (inspection.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Idempotency — already handed over
  if (inspection.status === "SUBMITTED" || inspection.status === "COMPLETED") {
    return NextResponse.json(
      { error: "Inspection has already been submitted" },
      { status: 409 },
    );
  }

  const handoverAt = new Date();
  const insurerEmail = body.insurerEmail?.trim();

  // Freeze the inspection
  await prisma.inspection.update({
    where: { id: inspectionId },
    data: { status: "SUBMITTED" },
  });

  // Advance ClaimProgress if present
  const claimProgress = await (prisma as any).claimProgress.findUnique({
    where: { inspectionId },
    select: { id: true, currentState: true },
  });

  if (claimProgress && claimProgress.currentState === "SCOPE_DRAFT") {
    await (prisma as any).claimProgress.update({
      where: { id: claimProgress.id },
      data: { currentState: "SCOPE_APPROVED", previousState: "SCOPE_DRAFT" },
    });
  }

  // Send insurer notification if email provided
  if (insurerEmail) {
    const portalLink = body.portalLink ?? "";
    await sendEmail({
      to: insurerEmail,
      subject: `Claim Package Ready: ${inspection.inspectionNumber}`,
      html: `
        <p>Dear Insurer,</p>
        <p>A claim package has been finalised and is ready for your review.</p>
        <ul>
          <li><strong>Inspection number:</strong> ${inspection.inspectionNumber}</li>
          <li><strong>Property:</strong> ${inspection.propertyAddress ?? "N/A"}</li>
          <li><strong>Handed over:</strong> ${handoverAt.toISOString()}</li>
        </ul>
        ${portalLink ? `<p><a href="${portalLink}">View claim in portal</a></p>` : ""}
        <p>Please contact us if you need further documentation.</p>
      `,
    });
  }

  domainEvents.emit({
    type: "claim.handed_over",
    payload: {
      inspectionId,
      userId: session.user.id,
      insurerEmail: insurerEmail ?? null,
      handoverAt: handoverAt.toISOString(),
    },
  });

  await writeInspectionAudit({
    inspectionId,
    userId: session.user.id,
    action: "claim.handed_over",
    entityType: "Inspection",
    entityId: inspectionId,
    changes: { status: "SUBMITTED", insurerNotified: !!insurerEmail },
    request,
  });

  return NextResponse.json({
    inspectionId,
    handoverAt: handoverAt.toISOString(),
    status: "SUBMITTED",
    insurerNotified: !!insurerEmail,
  });
}
