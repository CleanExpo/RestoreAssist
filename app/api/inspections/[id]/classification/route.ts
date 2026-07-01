import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

// GET - Get classification results
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

    // Get inspection with classifications
    const inspection = await prisma.inspection.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      include: {
        classifications: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            inspectionId: true,
            category: true,
            class: true,
            justification: true,
            standardReference: true,
            confidence: true,
            inputData: true,
            isFinal: true,
            reviewedBy: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        affectedAreas: {
          // Only the existence/array is referenced indirectly; project `id`
          // to keep the include block's prior behaviour while bounding payload.
          select: { id: true },
        },
      },
    });

    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    if (inspection.classifications.length === 0) {
      return apiError(request, {
        code: "VALIDATION",
        message:
          "Classification not yet determined. Please submit the inspection first.",
        status: 400,
      });
    }

    // Get the most recent classification (should be final)
    const classification = inspection.classifications[0];

    return NextResponse.json({
      classification,
      inspection: {
        id: inspection.id,
        status: inspection.status,
        inspectionNumber: inspection.inspectionNumber,
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "classification" });
  }
}
