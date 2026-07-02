import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitizeString } from "@/lib/sanitize";
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

    const libraries = await prisma.costLibrary.findMany({
      where: {
        userId: session.user.id,
      },
      select: {
        id: true,
        name: true,
        region: true,
        description: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true,
        items: {
          orderBy: { category: "asc" },
          take: 500,
        },
        _count: {
          select: { items: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ libraries });
  } catch (error) {
    return fromException(request, error, { stage: "list" });
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

  // RA-1266: prevents duplicate library creation on retry (and the
  // default-flag flipping if user retries a "set-as-default" create).
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let body: any;
      try {
        const parsed = rawBody ? JSON.parse(rawBody) : {};
        body =
          parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed
            : {};
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }
      const name = sanitizeString(body.name, 200);
      const region = sanitizeString(body.region, 200);
      const description = sanitizeString(body.description, 1000);
      const isDefault = body.isDefault;

      if (!name || !region) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Name and region are required",
          status: 400,
        });
      }

      // If setting as default, unset other defaults
      if (isDefault) {
        await prisma.costLibrary.updateMany({
          where: {
            userId,
            isDefault: true,
          },
          data: {
            isDefault: false,
          },
        });
      }

      const library = await prisma.costLibrary.create({
        data: {
          name,
          region,
          description,
          isDefault: isDefault || false,
          userId,
        },
        include: {
          items: true,
          _count: {
            select: {
              items: true,
            },
          },
        },
      });

      return NextResponse.json(library);
    } catch (error) {
      return fromException(request, error, { stage: "create" });
    }
  });
}
