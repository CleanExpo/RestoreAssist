import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { apiError, fromException } from "@/lib/api-errors";

const TAKE = 100;

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const auth = await verifyAdminFromDb(session);
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const state = searchParams.get("state")?.trim();
    const category = searchParams.get("category")?.trim();

    const where: {
      state?: string;
      category?: string;
    } = {};
    if (state) where.state = state;
    if (category) where.category = category;

    const items = await prisma.portalContent.findMany({
      where,
      take: TAKE,
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        scope: true,
        audience: true,
        category: true,
        slug: true,
        state: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ items });
  } catch (err) {
    return fromException(request, err, { stage: "admin/portal-content:list" });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const auth = await verifyAdminFromDb(session);
    if (auth.response) return auth.response;

    const body = await request.json().catch(() => null);
    const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
    const category =
      typeof body?.category === "string" ? body.category.trim() : "";
    const mdxContent =
      typeof body?.mdxContent === "string" ? body.mdxContent : "";
    const scope =
      typeof body?.scope === "string" ? body.scope : "PLATFORM_DEFAULT";
    const audience =
      typeof body?.audience === "string" ? body.audience : "customer";
    const state = typeof body?.state === "string" ? body.state : "DRAFT";

    if (!slug || !category || !mdxContent) {
      return apiError(request, {
        code: "VALIDATION",
        message: "slug, category, and mdxContent are required",
        status: 400,
      });
    }

    const item = await prisma.portalContent.create({
      data: {
        scope,
        audience,
        category,
        slug,
        mdxContent,
        state,
        publishedAt: state === "PUBLISHED" ? new Date() : null,
      },
      select: {
        id: true,
        slug: true,
        category: true,
        state: true,
      },
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    return fromException(request, err, { stage: "admin/portal-content:create" });
  }
}
