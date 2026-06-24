import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveInspectionWrite } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";

/**
 * Promote client-submitted evidence out of quarantine (client portal Phase 2b-ii).
 *
 * A technician reviews and accepts the client's portal uploads: each unreviewed
 * ClientEvidenceSubmission becomes a real EvidenceItem (so it now belongs to the
 * chain-of-custody record) and is marked reviewed. Authed + tenancy-gated — the
 * promotion is an explicit human act, and the chain-of-custody name records that
 * the item was client-submitted and staff-verified.
 */

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Sign in required",
        status: 401,
      });
    }
    const { id } = await params;
    const tenancy = await resolveInspectionWrite(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code: tenancy.status === 404 ? "NOT_FOUND" : "FORBIDDEN",
        message: tenancy.reason ?? "Forbidden",
        status: tenancy.status,
      });
    }

    // ra-query-ok: unreviewed submissions for a single inspection; the whole
    // batch is promoted in this action, so a take would silently drop evidence.
    const pending = await prisma.clientEvidenceSubmission.findMany({
      where: { inspectionId: id, reviewedAt: null },
    });

    const reviewerId = session.user.id;
    const reviewerName = session.user.name || "Staff";
    const now = new Date();
    let promoted = 0;

    for (const s of pending) {
      await prisma.$transaction([
        prisma.evidenceItem.create({
          data: {
            inspectionId: id,
            evidenceClass: s.fileUrl ? "PHOTO_DAMAGE" : "TECHNICIAN_NOTE",
            title: s.description || "Client-submitted photo",
            description: s.description ?? null,
            // Chain of custody: client-sourced, staff-verified on promotion.
            capturedById: reviewerId,
            capturedByName: `Client (verified by ${reviewerName})`,
            capturedAt: s.submittedAt,
            fileUrl: s.fileUrl ?? null,
            fileName: s.fileName ?? null,
            fileMimeType: s.fileMimeType ?? null,
            fileSizeBytes: s.fileSizeBytes ?? null,
          },
        }),
        prisma.clientEvidenceSubmission.update({
          where: {
            id: s.id,
            ...(tenancy.data.childInspectionFilter && {
              inspection: tenancy.data.childInspectionFilter,
            }),
          },
          data: { reviewedAt: now, reviewedById: reviewerId },
        }),
      ]);
      promoted++;
    }

    return NextResponse.json({ data: { promoted } });
  } catch (e) {
    return fromException(request, e);
  }
}
