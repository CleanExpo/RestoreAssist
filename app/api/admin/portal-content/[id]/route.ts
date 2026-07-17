import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { apiError, fromException } from "@/lib/api-errors";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    const auth = await verifyAdminFromDb(session);
    if (auth.response) return auth.response;

    const { id } = await context.params;
    const body = await request.json().catch(() => null);

    const data: {
      slug?: string;
      category?: string;
      mdxContent?: string;
      state?: string;
      publishedAt?: Date | null;
    } = {};

    if (typeof body?.slug === "string") data.slug = body.slug.trim();
    if (typeof body?.category === "string") data.category = body.category.trim();
    if (typeof body?.mdxContent === "string") data.mdxContent = body.mdxContent;

    if (typeof body?.state === "string") {
      data.state = body.state;
      if (body.state === "PUBLISHED") {
        data.publishedAt = new Date();
      } else if (body.state === "DRAFT") {
        data.publishedAt = null;
      }
    }

    if (Object.keys(data).length === 0) {
      return apiError(request, {
        code: "VALIDATION",
        message: "No updatable fields provided",
        status: 400,
      });
    }

    const item = await prisma.portalContent.update({
      where: { id },
      data,
      select: {
        id: true,
        slug: true,
        category: true,
        state: true,
        publishedAt: true,
      },
    });

    return NextResponse.json({ item });
  } catch (err) {
    return fromException(request, err, {
      stage: "admin/portal-content:patch",
    });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    const auth = await verifyAdminFromDb(session);
    if (auth.response) return auth.response;

    const { id } = await context.params;
    await prisma.portalContent.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return fromException(request, err, {
      stage: "admin/portal-content:delete",
    });
  }
}
