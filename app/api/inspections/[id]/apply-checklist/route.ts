import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { IICRC_CHECKLISTS } from "@/lib/iicrc-checklists";
import { withIdempotency } from "@/lib/idempotency";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";

// POST — apply an IICRC checklist template to an inspection's scope items
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

  // RA-1266: layered with the itemType-dedup already in the handler —
  // idempotency returns the cached created[] list on retry so the
  // client UI doesn't need to re-fetch to see the final state.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let body: { checklistId?: string } = {};
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }
      const { checklistId } = body;

      if (!checklistId) {
        return apiError(request, {
          code: "VALIDATION",
          message: "checklistId is required",
          status: 400,
        });
      }

      // RA-1711 batch 4 — adopt shared tenancy helper.
      const tenancy = await assertInspectionTenancy(session, id);
      if (!tenancy.ok) {
        return apiError(request, {
          code: tenancy.status === 404 ? "NOT_FOUND" : "FORBIDDEN",
          message: tenancy.reason,
          status: tenancy.status,
        });
      }

      const template = IICRC_CHECKLISTS.find((c) => c.id === checklistId);

      if (!template) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Checklist not found",
          status: 404,
        });
      }

      const existing = await prisma.scopeItem.findMany({
        where: { inspectionId: id },
        select: { itemType: true },
        take: 500,
      });
      const existingTypes = new Set(existing.map((e) => e.itemType));

      const newItems = template.items.filter(
        (item) => !existingTypes.has(item.itemType),
      );
      const skippedCount = template.items.length - newItems.length;

      let created: { id: string; itemType: string; description: string }[] = [];
      if (newItems.length > 0) {
        await prisma.scopeItem.createMany({
          data: newItems.map((item) => ({
            inspectionId: id,
            itemType: item.itemType,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            justification: item.justification,
            autoDetermined: true,
            isRequired: true,
            isSelected: true,
          })),
        });

        created = await prisma.scopeItem.findMany({
          where: {
            inspectionId: id,
            itemType: { in: newItems.map((i) => i.itemType) },
          },
          select: { id: true, itemType: true, description: true },
          take: newItems.length,
        });
      }

      return NextResponse.json({
        added: created.length,
        skipped: skippedCount,
        items: created,
      });
    } catch (error) {
      return fromException(request, error, {
        stage: "inspection-apply-checklist",
      });
    }
  });
}
