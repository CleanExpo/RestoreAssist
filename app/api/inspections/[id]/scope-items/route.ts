import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";

// POST - Add scope item
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        return NextResponse.json(
          { error: "Invalid JSON body" },
          { status: 400 },
        );
      }

      const inspection = await prisma.inspection.findFirst({
        where: { id, userId },
      });

      if (!inspection) {
        return NextResponse.json(
          { error: "Inspection not found" },
          { status: 404 },
        );
      }

      if (!body.itemType) {
        return NextResponse.json(
          { error: "Item type is required" },
          { status: 400 },
        );
      }

      if (!body.description) {
        return NextResponse.json(
          { error: "Description is required" },
          { status: 400 },
        );
      }

      const qty = body.quantity != null ? Number(body.quantity) : null;
      if (qty !== null && (!isFinite(qty) || qty < 0 || qty > 100_000)) {
        return NextResponse.json(
          {
            error:
              "quantity must be a non-negative finite number up to 100,000",
          },
          { status: 400 },
        );
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
      console.error("Error saving scope item:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  });
}
