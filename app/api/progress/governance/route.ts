/**
 * GET /api/progress/governance
 *
 * RA-1390 / Motion M-15. ADMIN-only read of override governance
 * reports. Optional ?month=YYYY-MM filter.
 *
 * Returns: { reports: OverrideGovernanceReport[], months: string[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;

  const monthParam = request.nextUrl.searchParams.get("month");
  let monthFilter: Date | null = null;
  if (monthParam) {
    const m = /^(\d{4})-(\d{2})$/.exec(monthParam);
    if (!m) {
      return NextResponse.json(
        { error: "month must be YYYY-MM" },
        { status: 400 },
      );
    }
    monthFilter = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  }

  const reports = await prisma.overrideGovernanceReport.findMany({
    where: monthFilter ? { reportMonth: monthFilter } : undefined,
    orderBy: [
      { reportMonth: "desc" },
      { overrideRate: "desc" },
    ],
    take: monthFilter ? 1000 : 100,
  });

  // Distinct months for the dashboard's month picker.
  const monthRows = await prisma.overrideGovernanceReport.findMany({
    distinct: ["reportMonth"],
    select: { reportMonth: true },
    orderBy: { reportMonth: "desc" },
    take: 24,
  });
  const months = monthRows.map((r) => r.reportMonth.toISOString().slice(0, 7));

  return NextResponse.json({ reports, months });
}
