import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST - Add scope item
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // Validate inspection exists and belongs to user
    const inspection = await prisma.inspection.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
      );
    }

    // Validate required fields
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

    // Validate and cap text field lengths; reject non-finite quantity
    const qty = body.quantity != null ? Number(body.quantity) : null;
    if (qty !== null && (!isFinite(qty) || qty < 0 || qty > 100_000)) {
      return NextResponse.json(
        {
          error: "quantity must be a non-negative finite number up to 100,000",
        },
        { status: 400 },
      );
    }

    // Create scope item
    const scopeItem = await prisma.scopeItem.create({
      data: {
        inspectionId: id,
        itemType: body.itemType
          ? String(body.itemType).slice(0, 100)
          : undefined,
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

    // Create audit log
    await prisma.auditLog.create({
      data: {
        inspectionId: id,
        action: "Scope item added",
        entityType: "ScopeItem",
        entityId: scopeItem.id,
        userId: session.user.id,
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
}
