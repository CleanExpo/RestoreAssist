import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

// POST - Add scope item
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

  // RA-1266: prevents duplicate scope-item rows on retry.
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

      const inspection = await prisma.inspection.findFirst({
        where: { id, userId },
      });

      if (!inspection) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Inspection not found",
          status: 404,
        });
      }

      if (!body.itemType) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Item type is required",
          status: 400,
        });
      }

      if (!body.description) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Description is required",
          status: 400,
        });
      }

      const qty = body.quantity != null ? Number(body.quantity) : null;
      if (qty !== null && (!isFinite(qty) || qty < 0 || qty > 100_000)) {
        return apiError(request, {
          code: "VALIDATION",
          message:
            "quantity must be a non-negative finite number up to 100,000",
          status: 400,
        });
      }

      const scopeItem = await prisma.scopeItem.create({
        data: {
          inspectionId: id,
          itemType: body.itemType
            ? String(body.itemType).slice(0, 100)
            : "GENERAL",
          description: String(body.description).slice(0, 2000),
          areaId: body.areaId || null,
          quantity: qty,
          unit: body.unit ? String(body.unit).slice(0, 50) : null,
          specification: body.specification
            ? String(body.specification).slice(0, 2000)
            : null,
          autoDetermined: body.autoDetermined ?? false,
          justification: body.justification
            ? String(body.justification).slice(0, 2000)
            : null,
          isRequired: body.isRequired ?? true,
          isSelected: body.isSelected ?? true,
        },
      });

      await prisma.auditLog.create({
        data: {
          inspectionId: id,
          action: "Scope item added",
          entityType: "ScopeItem",
          entityId: scopeItem.id,
          userId,
          changes: JSON.stringify({
            itemType: scopeItem.itemType,
            description: scopeItem.description,
          }),
        },
      });

      return NextResponse.json({ scopeItem }, { status: 201 });
    } catch (error) {
      return fromException(request, error, { stage: "scope-items-create" });
    }
  });
}
