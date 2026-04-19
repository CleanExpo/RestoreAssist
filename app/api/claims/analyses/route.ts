/**
 * API Route: Get Claim Analyses
 *
 * Returns analyses with filtering and pagination
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);

    const batchId = searchParams.get("batchId");
    const technicianName = searchParams.get("technicianName");
    const minScore = searchParams.get("minScore")
      ? parseInt(searchParams.get("minScore")!)
      : null;
    // RA-1307 — bound pagination to reject ?page=-1 and ?limit=1e9.
    const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "20") || 20),
    );
    const skip = (page - 1) * limit;

    const where: any = {
      batch: {
        userId,
      },
    };

    if (batchId) {
      where.batchId = batchId;
    }

    if (technicianName) {
      where.technicianName = {
        contains: technicianName,
        mode: "insensitive",
      };
    }

    if (minScore !== null) {
      where.OR = [
        { completenessScore: { gte: minScore } },
        { complianceScore: { gte: minScore } },
        { standardizationScore: { gte: minScore } },
      ];
    }

    const [analyses, total] = await Promise.all([
      prisma.claimAnalysis.findMany({
        where,
        include: {
          missingElements: {
            orderBy: { severity: "desc" },
            take: 10,
          },
          batch: {
            select: {
              id: true,
              folderName: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.claimAnalysis.count({ where }),
    ]);

    return NextResponse.json({
      analyses,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error("Error fetching analyses:", error);
    return NextResponse.json(
      { error: "Failed to fetch analyses" },
      { status: 500 },
    );
  }
}
