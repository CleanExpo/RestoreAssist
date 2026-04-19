import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitizeString } from "@/lib/sanitize";
import { withIdempotency } from "@/lib/idempotency";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const libraries = await prisma.costLibrary.findMany({
      where: {
        userId: session.user.id,
      },
      include: {
        items: {
          orderBy: {
            category: "asc",
          },
        },
        _count: {
          select: {
            items: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({ libraries });
  } catch (error) {
    console.error("Error fetching cost libraries:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // RA-1266: prevents duplicate library creation on retry (and the
  // default-flag flipping if user retries a "set-as-default" create).
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
      const name = sanitizeString(body.name, 200);
      const region = sanitizeString(body.region, 200);
      const description = sanitizeString(body.description, 1000);
      const isDefault = body.isDefault;

      if (!name || !region) {
        return NextResponse.json(
          { error: "Name and region are required" },
          { status: 400 },
        );
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
      console.error("Error creating cost library:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  });
}
