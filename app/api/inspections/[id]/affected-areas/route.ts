import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";
import { deriveAreaColumns } from "@/lib/units";

// POST - Add affected area
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
  const { id } = await params;

  try {
    const inspection = await prisma.inspection.findFirst({
      where: { id, userId },
      select: { id: true, workspaceId: true },
    });

    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    // RA-1266: prevents duplicate affected-area rows on retry.
    return withIdempotency(
      request,
      userId,
      async (rawBody) => {
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

          if (!body.roomZoneId || !body.roomZoneId.trim()) {
            return apiError(request, {
              code: "VALIDATION",
              message: "Room/Zone ID is required",
              status: 400,
            });
          }

          // RA-7001: m² (affectedAreaSqm) is canonical. Accept it from
          // metric-native clients; fall back to the legacy sq-ft field for
          // older clients. Dual-write both columns so every reader — metric
          // output surfaces and the sq-ft IICRC engine — stays correct.
          const areaColumns = deriveAreaColumns(body);
          // Guard on the m² value: 100,000 sq ft ≈ 9,290 m².
          if (
            !areaColumns ||
            areaColumns.affectedAreaSqm > 9_290
          ) {
            return apiError(request, {
              code: "VALIDATION",
              message:
                "Affected area (m²) must be a finite number between 0 and 9,290",
              status: 400,
            });
          }

          if (!body.waterSource) {
            return apiError(request, {
              code: "VALIDATION",
              message: "Water source is required",
              status: 400,
            });
          }

          if (body.photos !== undefined && body.photos !== null) {
            if (!Array.isArray(body.photos) || body.photos.length > 50) {
              return apiError(request, {
                code: "VALIDATION",
                message: "photos must be an array of up to 50 items",
                status: 400,
              });
            }
          }

          const affectedArea = await prisma.affectedArea.create({
            data: {
              inspectionId: id,
              roomZoneId: String(body.roomZoneId).trim().slice(0, 200),
              affectedAreaSqm: areaColumns.affectedAreaSqm,
              affectedSquareFootage: areaColumns.affectedSquareFootage,
              waterSource: String(body.waterSource).slice(0, 100),
              timeSinceLoss: body.timeSinceLoss
                ? typeof body.timeSinceLoss === "number"
                  ? body.timeSinceLoss
                  : parseFloat(String(body.timeSinceLoss)) || null
                : null,
              description: body.description
                ? String(body.description).slice(0, 2000)
                : null,
              photos: body.photos ? JSON.stringify(body.photos) : null,
            },
          });

          await prisma.auditLog.create({
            data: {
              inspectionId: id,
              action: "Affected area added",
              entityType: "AffectedArea",
              entityId: affectedArea.id,
              userId,
              changes: JSON.stringify({
                roomZoneId: affectedArea.roomZoneId,
                affectedAreaSqm: affectedArea.affectedAreaSqm,
                affectedSquareFootage: affectedArea.affectedSquareFootage,
                waterSource: affectedArea.waterSource,
              }),
            },
          });

          return NextResponse.json({ affectedArea }, { status: 201 });
        } catch (error) {
          return fromException(request, error, {
            stage: "affected-area-create",
          });
        }
      },
      inspection.workspaceId
        ? {
            clientMutation: {
              workspaceId: inspection.workspaceId,
              userId,
              inspectionId: id,
              mutationType: "affected-area",
            },
          }
        : undefined,
    );
  } catch (error) {
    return fromException(request, error, { stage: "affected-area-load" });
  }
}
