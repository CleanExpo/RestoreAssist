import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

/** GET: Fetch one restoration document */
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

    const doc = await prisma.restorationDocument.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!doc) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Document not found",
        status: 404,
      });
    }

    return NextResponse.json({ document: doc });
  } catch (err) {
    return fromException(request, err, { stage: "load" });
  }
}

/** PUT: Update a restoration document */
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
    const { documentNumber, title, reportId, data } = body;

    const existing = await prisma.restorationDocument.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Document not found",
        status: 404,
      });
    }

    const updateData: {
      documentNumber?: string;
      title?: string | null;
      reportId?: string | null;
      data?: object;
    } = {};
    if (documentNumber !== undefined)
      updateData.documentNumber = String(documentNumber);
    if (title !== undefined) updateData.title = title || null;
    if (reportId !== undefined) updateData.reportId = reportId || null;
    if (data !== undefined) updateData.data = data as object;

    const doc = await prisma.restorationDocument.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ document: doc });
  } catch (err) {
    return fromException(request, err, { stage: "update" });
  }
}

/** DELETE: Remove a restoration document */
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

    const existing = await prisma.restorationDocument.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Document not found",
        status: 404,
      });
    }

    await prisma.restorationDocument.delete({ where: { id, userId: session.user.id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return fromException(request, err, { stage: "delete" });
  }
}
