import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiError, fromException } from "@/lib/api-errors";
import { syncProfileVerified } from "@/lib/contractors/certification-verification";

// Update certification
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id } = await params;

    // Verify ownership
    const certification = await prisma.contractorCertification.findUnique({
      where: { id },
      include: {
        profile: {
          select: { userId: true },
        },
      },
    });

    if (!certification) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Certification not found",
        status: 404,
      });
    }

    if (certification.profile.userId !== session.user.id) {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Forbidden",
        status: 403,
      });
    }

    // Contractors cannot update verified certifications
    if (certification.verificationStatus === "VERIFIED") {
      return apiError(request, {
        code: "VALIDATION",
        message: "Cannot update verified certification",
        status: 400,
      });
    }

    const body = await request.json();
    const {
      certificationType,
      certificationName,
      issuingBody,
      certificationNumber,
      issueDate,
      expiryDate,
      documentUrl,
    } = body;

    const updated = await prisma.contractorCertification.update({
      where: { id, profile: { userId: session.user.id } },
      data: {
        ...(certificationType && { certificationType }),
        ...(certificationName && { certificationName }),
        ...(issuingBody && { issuingBody }),
        ...(certificationNumber !== undefined && { certificationNumber }),
        ...(issueDate && { issueDate: new Date(issueDate) }),
        ...(expiryDate !== undefined && {
          expiryDate: expiryDate ? new Date(expiryDate) : null,
        }),
        ...(documentUrl !== undefined && { documentUrl }),
        // RA-8457: a corrected REJECTED certification goes back for review.
        // The old decision is cleared so it cannot read as current.
        ...(certification.verificationStatus === "REJECTED" && {
          verificationStatus: "PENDING" as const,
          verifiedAt: null,
          verifiedBy: null,
          verificationNotes: null,
        }),
      },
    });

    return NextResponse.json({ certification: updated });
  } catch (error: any) {
    console.error("Error updating certification:", error);
    return fromException(request, error, {
      stage: "contractors/certifications:update",
    });
  }
}

// Delete certification
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id } = await params;

    // Verify ownership
    const certification = await prisma.contractorCertification.findUnique({
      where: { id },
      include: {
        profile: {
          select: { userId: true },
        },
      },
    });

    if (!certification) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Certification not found",
        status: 404,
      });
    }

    if (certification.profile.userId !== session.user.id) {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Forbidden",
        status: 403,
      });
    }

    // RA-8457: removing a VERIFIED certification can end the profile's
    // verified state, so the derived flag is recomputed in the same write.
    await prisma.$transaction(async (tx) => {
      await tx.contractorCertification.delete({
        where: { id, profile: { userId: session.user.id } },
      });
      await syncProfileVerified(tx, certification.profileId);
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting certification:", error);
    return fromException(request, error, {
      stage: "contractors/certifications:delete",
    });
  }
}
