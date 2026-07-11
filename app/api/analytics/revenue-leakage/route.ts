import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import {
  analyzeRevenueLeakage,
  benchmarkResolverFromPricingDb,
  type AscoraJobInput,
  type PricingDbRow,
} from "@/lib/analytics/revenue-leakage";
import {
  analyzeCategoryLeakage,
  type LeakageLine,
} from "@/lib/analytics/equipment-category";

/**
 * GET /api/analytics/revenue-leakage — RA-7026
 *
 * Owner-only, read-only. Compares actual invoiced Ascora line items against the
 * learned ScopePricingDatabase benchmark and returns the "money left on the
 * table" report (totals, per claim type, top under-priced parts). Returns a
 * clear `connected: false` state when no Ascora integration exists yet.
 */
const MAX_JOBS = 5000;
const MAX_PRICING_ROWS = 10000;

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

    const integration = await prisma.ascoraIntegration.findUnique({
      where: { userId: session.user.id },
      select: { id: true, totalJobsImported: true, lastSyncAt: true },
    });

    if (!integration) {
      return NextResponse.json({
        connected: false,
        message: "No Ascora integration — connect Ascora and run a sync first.",
      });
    }

    const [jobs, pricingRows] = await Promise.all([
      prisma.ascoraJob.findMany({
        where: { integrationId: integration.id },
        select: {
          ascoraJobId: true,
          claimType: true,
          totalExTax: true,
          lineItems: {
            select: {
              partNumber: true,
              description: true,
              quantity: true,
              unitPriceExTax: true,
              amountExTax: true,
            },
          },
        },
        take: MAX_JOBS,
      }),
      prisma.scopePricingDatabase.findMany({
        where: { isActive: true },
        select: {
          partNumber: true,
          averageUnitPriceAU: true,
          medianUnitPriceAU: true,
        },
        take: MAX_PRICING_ROWS,
      }),
    ]);

    const resolver = benchmarkResolverFromPricingDb(pricingRows as PricingDbRow[]);
    const report = analyzeRevenueLeakage(jobs as AscoraJobInput[], resolver);

    // Category benchmark (RA-7026): the per-SKU join finds ~0 overlap between
    // the owner's invoice codes and the rate-card SKUs, so also measure leakage
    // by equipment/labour CATEGORY against the pricing defaults — where the
    // real signal (labour + AFD under-charging) actually lives.
    const lines: LeakageLine[] = jobs.flatMap((j) =>
      j.lineItems.map((li) => ({
        description: li.description,
        quantity: li.quantity,
        unitPriceExTax: li.unitPriceExTax,
        amountExTax: li.amountExTax,
      })),
    );
    const categoryLeakage = analyzeCategoryLeakage(lines);

    return NextResponse.json({
      connected: true,
      totalJobsImported: integration.totalJobsImported,
      lastSyncAt: integration.lastSyncAt,
      truncated: report.jobsAnalyzed >= MAX_JOBS,
      benchmarkPartsLoaded: pricingRows.length,
      report,
      categoryLeakage,
    });
  } catch (error) {
    return fromException(request, error, { stage: "revenue-leakage" });
  }
}
