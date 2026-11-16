import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import {
  formTextEditRefusal,
  noSignedSignatureWhere,
  statusMoveRefusal,
} from "@/lib/authority-forms/signed-record-guard";

/**
 * GET /api/authority-forms/:id
 * Get a specific authority form instance
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

    const { id } = await params;

    const form = await prisma.authorityFormInstance.findUnique({
      where: { id },
      include: {
        template: true,
        signatures: {
          orderBy: { createdAt: "asc" },
        },
        report: {
          select: {
            id: true,
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

    return NextResponse.json({ form });
  } catch (error) {
    console.error("Error fetching authority form:", error);
    return fromException(request, error, { stage: "get" });
  }
}

/**
 * PUT /api/authority-forms/:id
 * Update an authority form instance
 */
export async function PUT(
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
    const body = await request.json();

    // Verify form exists and user has access
    const existingForm = await prisma.authorityFormInstance.findUnique({
      where: { id },
      include: {
        report: {
          select: {
            userId: true,
            assignedManagerId: true,
            assignedAdminId: true,
          },
        },
        signatures: { select: { signedAt: true }, take: 100 },
      },
    });

    if (!existingForm) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Form not found",
        status: 404,
      });
    }

    // Check permissions
    if (
      existingForm.report.userId !== session.user.id &&
      existingForm.report.assignedManagerId !== session.user.id &&
      existingForm.report.assignedAdminId !== session.user.id
    ) {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Forbidden",
        status: 403,
      });
    }

    // RA-8400: a signed form is a closed legal record. The wording cannot
    // change once anyone has signed, and the body may only request an
    // allowed status move (never PARTIALLY_SIGNED or COMPLETED).
    const updateData: {
      authorityDescription?: string;
      status?: "CANCELLED";
    } = {};
    if (body.authorityDescription !== undefined) {
      if (typeof body.authorityDescription !== "string") {
        return apiError(request, {
          code: "VALIDATION",
          message: "authorityDescription must be a string",
          status: 400,
        });
      }
      const refusal = formTextEditRefusal(existingForm);
      if (refusal) {
        return apiError(request, {
          code: "CONFLICT",
          message: refusal,
          status: 409,
        });
      }
      updateData.authorityDescription = body.authorityDescription;
    }
    if (body.status !== undefined) {
      const refusal = statusMoveRefusal(existingForm.status, body.status);
      if (refusal) {
        return apiError(request, {
          code: "CONFLICT",
          message: refusal,
          status: 409,
        });
      }
      updateData.status = body.status;
    }

    // The same rules sit in the write itself: if a signature or status change
    // lands between the read above and this write, nothing is written.
    const writeResult = await prisma.authorityFormInstance.updateMany({
      where: {
        id,
        status: existingForm.status,
        ...(updateData.authorityDescription !== undefined
          ? noSignedSignatureWhere()
          : {}),
        report: {
          OR: [
            { userId: session.user.id },
            { assignedManagerId: session.user.id },
            { assignedAdminId: session.user.id },
          ],
        },
      },
      data: updateData,
    });

    if (writeResult.count === 0) {
      return apiError(request, {
        code: "CONFLICT",
        message: "This form changed while you were editing it; reload and try again",
        status: 409,
      });
    }

    const updatedForm = await prisma.authorityFormInstance.findUnique({
      where: { id },
      include: {
        template: true,
        signatures: { take: 100 },
      },
    });

    return NextResponse.json({ form: updatedForm });
  } catch (error) {
    console.error("Error updating authority form:", error);
    return fromException(request, error, { stage: "update" });
  }
}

/**
 * DELETE /api/authority-forms/:id
 * Delete an authority form instance
 */
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

    // Verify form exists and user has access
    const existingForm = await prisma.authorityFormInstance.findUnique({
      where: { id },
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

    if (!existingForm) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Form not found",
        status: 404,
      });
    }

    // Check permissions
    if (
      existingForm.report.userId !== session.user.id &&
      existingForm.report.assignedManagerId !== session.user.id &&
      existingForm.report.assignedAdminId !== session.user.id
    ) {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Forbidden",
        status: 403,
      });
    }

    // Delete form (signatures will be cascade deleted)
    await prisma.authorityFormInstance.delete({
      where: {
        id,
        report: {
          OR: [
            { userId: session.user.id },
            { assignedManagerId: session.user.id },
            { assignedAdminId: session.user.id },
          ],
        },
      },
    });

    return NextResponse.json({ message: "Form deleted successfully" });
  } catch (error) {
    console.error("Error deleting authority form:", error);
    return fromException(request, error, { stage: "delete" });
  }
}
