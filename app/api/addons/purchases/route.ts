import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

/**
 * Get add-on purchase history for the current user
 */
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

    try {
      const purchases = await prisma.addonPurchase.findMany({
        where: {
          userId: session.user.id,
          status: "COMPLETED",
        },
        select: {
          id: true,
          addonName: true,
          reportLimit: true,
          amount: true,
          currency: true,
          purchasedAt: true,
          status: true,
        },
        orderBy: {
          purchasedAt: "desc",
        },
        take: 100,
      });

      return NextResponse.json({
        success: true,
        purchases,
      });
    } catch (error: any) {
      // If AddonPurchase table doesn't exist, return empty array
      if (
        error.message?.includes("Unknown model") ||
        error.message?.includes("does not exist")
      ) {
        return NextResponse.json({
          success: true,
          purchases: [],
        });
      }
      throw error;
    }
  } catch (err) {
    return fromException(request, err, { stage: "list" });
  }
}
