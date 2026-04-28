import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const templates = await (prisma as any).scopeTemplate.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      templates.map((t: any) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        claimType: t.claimType,
        items: t.items ? JSON.parse(t.items) : [],
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        _count: { items: t.items ? JSON.parse(t.items).length : 0 },
      })),
    );
  } catch (err) {
    return fromException(request, err, { stage: "load" });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;

  // RA-1266: prevents duplicate scope-template rows on retry.
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
      const { name, description, claimType, items } = body;

      if (!name?.trim()) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Name is required",
          status: 400,
        });
      }

      const template = await (prisma as any).scopeTemplate.create({
        data: {
          userId,
          name: name.trim(),
          description: description?.trim() || null,
          claimType: claimType || null,
          items: items ? JSON.stringify(items) : null,
        },
      });

      return NextResponse.json(
        {
          id: template.id,
          name: template.name,
          description: template.description,
          claimType: template.claimType,
          items: template.items ? JSON.parse(template.items) : [],
          createdAt: template.createdAt,
          updatedAt: template.updatedAt,
          _count: {
            items: template.items ? JSON.parse(template.items).length : 0,
          },
        },
        { status: 201 },
      );
    } catch (err) {
      return fromException(request, err, { stage: "create" });
    }
  });
}
