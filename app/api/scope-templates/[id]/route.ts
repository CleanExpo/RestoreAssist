import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const existing = await (prisma as any).scopeTemplate.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const { name, description, claimType, items } = body;

    const updated = await (prisma as any).scopeTemplate.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && {
          description: description?.trim() || null,
        }),
        ...(claimType !== undefined && { claimType: claimType || null }),
        ...(items !== undefined && {
          items: items ? JSON.stringify(items) : null,
        }),
      },
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      description: updated.description,
      claimType: updated.claimType,
      items: updated.items ? JSON.parse(updated.items) : [],
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      _count: { items: updated.items ? JSON.parse(updated.items).length : 0 },
    });
  } catch (error: any) {
    console.error("[scope-templates] PATCH error:", error);
    return NextResponse.json(
      {
        error: "Failed to update scope template",
        details:
          process.env.NODE_ENV === "development" ? error?.message : undefined,
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const existing = await (prisma as any).scopeTemplate.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await (prisma as any).scopeTemplate.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[scope-templates] DELETE error:", error);
    return NextResponse.json(
      {
        error: "Failed to delete scope template",
        details:
          process.env.NODE_ENV === "development" ? error?.message : undefined,
      },
      { status: 500 },
    );
  }
}
