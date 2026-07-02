import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitizeString } from "@/lib/sanitize";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

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

  // RA-1266: prevents duplicate cost-item creation on retry.
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
      const libraryId = body.libraryId;
      const category = sanitizeString(body.category, 200);
      const description = sanitizeString(body.description, 1000);
      const rate = body.rate;
      const unit = sanitizeString(body.unit, 50);

      if (
        !libraryId ||
        !category ||
        !description ||
        rate === undefined ||
        !unit
      ) {
        return apiError(request, {
          code: "VALIDATION",
          message: "All fields are required",
          status: 400,
        });
      }
      const parsedRate = parseFloat(rate);
      if (!isFinite(parsedRate) || parsedRate < 0 || parsedRate > 1_000_000) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Rate must be a non-negative number up to 1,000,000",
          status: 400,
        });
      }

      const library = await prisma.costLibrary.findFirst({
        where: { id: libraryId, userId },
      });

      if (!library) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Cost library not found",
          status: 404,
        });
      }

      const item = await prisma.costItem.create({
        data: {
          category,
          description,
          rate: parsedRate,
          unit,
          libraryId,
        },
      });

      return NextResponse.json(item);
    } catch (error) {
      return fromException(request, error, { stage: "create" });
    }
  });
}
