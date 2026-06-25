import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

/**
 * POST /api/authority-forms/:id/signatures
 * Add a signature to an authority form
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;
  const { id: formId } = await params;

  // RA-1266: signatures are terminal legal records — prevent duplicate
  // signature rows when the signer double-clicks.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let body: any;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }
      const {
        signatureId,
        signatureData,
        signatoryName,
        signatoryEmail,
        signatoryRole,
        action,
      } = body;

      // Verify form exists and user has access (guards EVERY branch below)
      const form = await prisma.authorityFormInstance.findUnique({
        where: { id: formId },
        include: {
          report: {
            select: {
              userId: true,
              assignedManagerId: true,
              assignedAdminId: true,
            },
          },
        },
      });

      if (!form) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Form not found",
          status: 404,
        });
      }

      // Check permissions
      if (
        form.report.userId !== userId &&
        form.report.assignedManagerId !== userId &&
        form.report.assignedAdminId !== userId
      ) {
        return apiError(request, {
          code: "FORBIDDEN",
          message: "Forbidden",
          status: 403,
        });
      }

      // Create new signatory slot
      if (action === "add_signatory") {
        if (!signatoryName || !signatoryRole) {
          return apiError(request, {
            code: "VALIDATION",
            message: "Signatory name and role are required",
            status: 400,
          });
        }

        const newSignature = await prisma.authorityFormSignature.create({
          data: {
            instanceId: formId,
            signatoryName,
            signatoryRole,
            signatoryEmail: signatoryEmail || null,
          },
        });

        // Update form status to pending if still draft
        const currentForm = await prisma.authorityFormInstance.findUnique({
          where: { id: formId },
          select: { status: true },
        });
        if (currentForm?.status === "DRAFT") {
          await prisma.authorityFormInstance.update({
            where: { id: formId },
            data: { status: "PENDING_SIGNATURES" },
          });
        }

        return NextResponse.json({ signature: newSignature });
      }

      if (!signatureId || !signatureData) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Signature ID and signature data are required",
          status: 400,
        });
      }

      // Get client IP and user agent for verification
      const ipAddress =
        request.headers.get("x-forwarded-for") ||
        request.headers.get("x-real-ip") ||
        "unknown";
      const userAgent = request.headers.get("user-agent") || "unknown";

      // Update signature
      const signature = await prisma.authorityFormSignature.update({
        where: { id: signatureId },
        data: {
          signatureData,
          signatoryName: signatoryName || undefined,
          signedAt: new Date(),
          ipAddress,
          userAgent,
        },
      });

      // Check if all signatures are complete
      const allSignatures = await prisma.authorityFormSignature.findMany({
        where: { instanceId: formId },
        orderBy: { createdAt: "asc" },
        take: 100,
      });

      const allSigned = allSignatures.every((sig) => sig.signedAt !== null);

      // Update form status if all signatures are complete
      if (allSigned) {
        await prisma.authorityFormInstance.update({
          where: { id: formId },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
          },
        });
      } else {
        // Update to partially signed if at least one signature exists
        const hasAnySignature = allSignatures.some(
          (sig) => sig.signedAt !== null,
        );
        if (hasAnySignature && form.status === "DRAFT") {
          await prisma.authorityFormInstance.update({
            where: { id: formId },
            data: { status: "PARTIALLY_SIGNED" },
          });
        }
      }

      return NextResponse.json({ signature, allSigned });
    } catch (error) {
      console.error("Error adding signature:", error);
      return fromException(request, error, { stage: "add-signature" });
    }
  });
}

/**
 * GET /api/authority-forms/:id/signatures
 * Get all signatures for an authority form
 */
export async function GET(
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

    const { id: formId } = await params;

    // Verify form exists and user has access
    const form = await prisma.authorityFormInstance.findUnique({
      where: { id: formId },
      include: {
        report: {
          select: {
            userId: true,
            assignedManagerId: true,
            assignedAdminId: true,
          },
        },
      },
    });

    if (!form) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Form not found",
        status: 404,
      });
    }

    // Check permissions
    if (
      form.report.userId !== session.user.id &&
      form.report.assignedManagerId !== session.user.id &&
      form.report.assignedAdminId !== session.user.id
    ) {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Forbidden",
        status: 403,
      });
    }

    const signatures = await prisma.authorityFormSignature.findMany({
      where: { instanceId: formId },
      orderBy: { createdAt: "asc" },
      take: 100,
    });

    return NextResponse.json({ signatures });
  } catch (error) {
    console.error("Error fetching signatures:", error);
    return fromException(request, error, { stage: "list-signatures" });
  }
}
