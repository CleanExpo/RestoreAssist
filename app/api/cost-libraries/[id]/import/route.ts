import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorised",
      status: 401,
    });
  }
  const userId = session.user.id;
  const { id } = await params;

  // RA-1266: bulk import of cost items — retry without idempotency would
  // attempt to re-insert; skipDuplicates catches most of it but idempotency
  // returns the original response with the true skipped count.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      const library = await prisma.costLibrary.findFirst({
        where: { id, userId },
      });
      if (!library) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Library not found",
          status: 404,
        });
      }

      let body: {
        items?: Array<{
          category?: string;
          description: string;
          unit: string;
          rate: number;
        }>;
      } = {};
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
      const { items } = body;

      if (!Array.isArray(items) || items.length === 0) {
        return apiError(request, {
          code: "VALIDATION",
          message: "No items provided",
          status: 400,
        });
      }

      const valid = items.filter(
        (i) =>
          i.description &&
          i.unit &&
          typeof i.rate === "number" &&
          !isNaN(i.rate),
      );
      const skipped = items.length - valid.length;

      const created = await prisma.costItem.createMany({
        data: valid.map((i) => ({
          libraryId: id,
          category: i.category ?? "Uncategorised",
          description: i.description,
          unit: i.unit,
          rate: i.rate,
        })),
        skipDuplicates: true,
      });

      return NextResponse.json({ imported: created.count, skipped });
    } catch (error) {
      return fromException(request, error, { stage: "import" });
    }
  });
}
