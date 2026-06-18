import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

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

    const existing = await (prisma as any).scopeTemplate.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!existing) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Not found",
        status: 404,
      });
    }

    const body = await request.json();
    const { name, description, claimType, items } = body;

    const updated = await (prisma as any).scopeTemplate.update({
      where: { id, userId: session.user.id },
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
  } catch (err) {
    return fromException(request, err, { stage: "update" });
  }
}

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

    const existing = await (prisma as any).scopeTemplate.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!existing) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Not found",
        status: 404,
      });
    }

    await (prisma as any).scopeTemplate.delete({ where: { id, userId: session.user.id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    return fromException(request, err, { stage: "delete" });
  }
}
