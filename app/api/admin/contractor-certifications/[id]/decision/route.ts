import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  verifyAdminFromDb,
  verifyPlatformSupportOperator,
} from "@/lib/admin-auth";
import { apiError, fromException } from "@/lib/api-errors";
import {
  isCertificationDecision,
  syncProfileVerified,
} from "@/lib/contractors/certification-verification";

const MAX_NOTES_LENGTH = 2000;

/**
 * RA-8457 — a RestoreAssist platform operator verifies or rejects a
 * contractor certification that is waiting for review.
 *
 * Every self-registered business owner is `role: "ADMIN"`, so
 * `verifyAdminFromDb` alone would let any firm verify a competitor's
 * credentials. The platform-support allowlist is required as well.
 *
 * Body: `{ decision: "VERIFIED" | "REJECTED", notes?: string }`. A rejection
 * must carry a note so the contractor knows what to fix.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const admin = await verifyAdminFromDb(session);
    if (admin.response) return admin.response;
    const auth = verifyPlatformSupportOperator(admin);
    if (auth.response) return auth.response;
    const operatorId = auth.user!.id;

    const { id } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Request body must be JSON",
        status: 400,
      });
    }
    const { decision, notes } = (body ?? {}) as {
      decision?: unknown;
      notes?: unknown;
    };

    if (!isCertificationDecision(decision)) {
      return apiError(request, {
        code: "VALIDATION",
        message: 'decision must be "VERIFIED" or "REJECTED"',
        status: 400,
      });
    }
    if (notes !== undefined && notes !== null && typeof notes !== "string") {
      return apiError(request, {
        code: "VALIDATION",
        message: "notes must be text",
        status: 400,
      });
    }
    const trimmedNotes = typeof notes === "string" ? notes.trim() : "";
    if (trimmedNotes.length > MAX_NOTES_LENGTH) {
      return apiError(request, {
        code: "VALIDATION",
        message: `notes must be ${MAX_NOTES_LENGTH} characters or fewer`,
        status: 400,
      });
    }
    if (decision === "REJECTED" && trimmedNotes.length === 0) {
      return apiError(request, {
        code: "VALIDATION",
        message: "A rejection needs a note explaining what to fix",
        status: 400,
      });
    }

    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      // Compare-and-set: only a PENDING certification can be decided, so two
      // operators deciding at once cannot overwrite each other.
      const moved = await tx.contractorCertification.updateMany({
        where: { id, verificationStatus: "PENDING" },
        data: {
          verificationStatus: decision,
          verifiedAt: now,
          verifiedBy: operatorId,
          verificationNotes: trimmedNotes.length > 0 ? trimmedNotes : null,
        },
      });
      if (moved.count === 0) return null;

      const certification = await tx.contractorCertification.findUnique({
        where: { id },
      });
      if (!certification) return null;
      const profileVerified = await syncProfileVerified(
        tx,
        certification.profileId,
        now,
      );
      return { certification, profileVerified };
    });

    if (!result) {
      const existing = await prisma.contractorCertification.findUnique({
        where: { id },
        select: { verificationStatus: true },
      });
      if (!existing) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Certification not found",
          status: 404,
        });
      }
      return apiError(request, {
        code: "CONFLICT",
        message: `Only a PENDING certification can be decided; this one is ${existing.verificationStatus}`,
        status: 409,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    return fromException(request, error, {
      stage: "admin/contractor-certifications:decision",
    });
  }
}
