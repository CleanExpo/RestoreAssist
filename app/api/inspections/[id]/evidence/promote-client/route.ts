import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveInspectionWrite } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";
import { buildEvidenceStructuredData } from "@/lib/evidence/structured-data";
import { exemptFromSigningPolicy } from "@/lib/evidence/signing-policy";

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

    // RA-7090 round 3: this is the FOURTH EvidenceItem writer, and it
    // previously passed through neither shared control. The signing-policy
    // exemption is EXPLICIT (see lib/evidence/signing-policy.ts) — client
    // portal uploads can never carry a technician's device signature — but
    // the sanitiser applies unconditionally, so a promoted row is stamped
    // signedManifestVerified:false and can never present as signed.
    //
    // RA-7090 slice 2 (P0-2 re-review) — RESIDUAL, founder-visible: this route
    // promotes homeowner portal uploads into chain-of-custody EvidenceItems
    // carrying file provenance (fileUrl/mime/size below) with fileSha256:null
    // and NO signature — an unsigned byte-referencing evidence item that the
    // CLIENT_PORTAL_PROMOTION exemption deliberately permits. It is PRE-EXISTING
    // (introduced by #1987, unchanged by this slice). Closing it fully — proving
    // a content hash over the promoted bytes, or a staff attestation signature —
    // is the central client-portal issuance-gate change and is OUT OF SCOPE for
    // this slice; forcing it fail-closed here would block legitimate homeowner
    // evidence. Flagged for that follow-up rather than silently widened or left
    // to masquerade as closed.
    const policy = exemptFromSigningPolicy("CLIENT_PORTAL_PROMOTION");
    const promotedStructuredData = buildEvidenceStructuredData({
      fileSha256: null,
      downgradeReason: policy.downgradeReason,
    });

    // Promote the whole batch in a single transaction instead of opening one
    // interactive transaction per submission (N round-trips). All-or-nothing.
    const ops = pending.flatMap((s) => [
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
          structuredData: promotedStructuredData,
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

    if (ops.length > 0) {
      await prisma.$transaction(ops);
    }
    const promoted = pending.length;

    return NextResponse.json({ data: { promoted } });
  } catch (e) {
    return fromException(request, e);
  }
}
