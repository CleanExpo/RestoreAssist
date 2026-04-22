import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordMutationAudit } from "@/lib/audit-log";

/**
 * GET /api/estimates/[id] — fetch a single estimate with full line items
 * and commercial params. Ownership enforced (estimate.userId === session).
 *
 * Closes RA-1268 (GET-by-id missing — UI couldn't retrieve a single
 * estimate, forcing round-trips through parent report).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const estimate = await prisma.estimate.findUnique({
      where: { id },
      include: {
        lineItems: {
          orderBy: { displayOrder: "asc" },
        },
      },
    });

    if (!estimate || estimate.userId !== session.user.id) {
      // Return 404 (not 403) so we don't leak existence
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ estimate });
  } catch (error) {
    console.error("[estimates/[id] GET]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/estimates/[id] — soft-delete an estimate. Only allowed in
 * DRAFT or INTERNAL_REVIEW status; LOCKED / APPROVED estimates require
 * going through the status workflow to avoid compliance audit gaps.
 *
 * Cascade: line items are removed too (relation onDelete: Cascade).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const estimate = await prisma.estimate.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true },
    });

    if (!estimate || estimate.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Guard rail: block deletion of locked / approved estimates. If the
    // user genuinely needs to remove one they should change status first
    // (auditable transition). This prevents silent removal of estimates
    // that may already be referenced by an invoice.
    if (estimate.status === "LOCKED" || estimate.status === "APPROVED") {
      return NextResponse.json(
        {
          error:
            "Cannot delete a LOCKED or APPROVED estimate. Change its status first via the status workflow.",
        },
        { status: 409 },
      );
    }

    await prisma.estimate.delete({ where: { id } });

    await recordMutationAudit({
      resource: "estimate",
      resourceId: id,
      verb: "DELETE",
      action: "estimate.delete",
      actorUserId: session.user.id,
      metadata: { previousStatus: estimate.status },
      request,
    });

    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    console.error("[estimates/[id] DELETE]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
