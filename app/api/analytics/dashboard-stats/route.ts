import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // 1. Active jobs: inspections where status != 'COMPLETED'
    const activeJobs = await prisma.inspection.count({
      where: {
        userId,
        status: { not: "COMPLETED" },
      },
    });

    // 2. Avg drying days: completed inspections in last 30d
    //    Use processedAt (completion timestamp) - createdAt
    const completedInspections = await prisma.inspection.findMany({
      where: {
        userId,
        status: "COMPLETED",
        processedAt: { gte: thirtyDaysAgo },
      },
      select: {
        createdAt: true,
        processedAt: true,
      },
    });

    let avgDryingDays = 0;
    if (completedInspections.length > 0) {
      const totalDays = completedInspections.reduce((sum, insp) => {
        if (!insp.processedAt) return sum;
        const diffMs = insp.processedAt.getTime() - insp.createdAt.getTime();
        return sum + diffMs / (1000 * 60 * 60 * 24);
      }, 0);
      avgDryingDays = totalDays / completedInspections.length;
    }

    // 3. Revenue MTD: sum of Invoice totalIncGST (cents) / 100 for current calendar month
    const revenueMtdResult = await prisma.invoice.aggregate({
      where: {
        userId,
        invoiceDate: { gte: startOfMonth },
      },
      _sum: {
        totalIncGST: true,
      },
    });
    const revenueMtdAud = (revenueMtdResult._sum.totalIncGST ?? 0) / 100;

    // 4. Completion rate: (COMPLETED / total) * 100 for last 30d
    const [completedCount, totalCount] = await Promise.all([
      prisma.inspection.count({
        where: {
          userId,
          status: "COMPLETED",
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
      prisma.inspection.count({
        where: {
          userId,
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
    ]);

    const completionRatePct =
      totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

    return NextResponse.json({
      activeJobs,
      avgDryingDays,
      revenueMtdAud,
      completionRatePct,
    });
  } catch (error) {
    console.error("[dashboard-stats] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
