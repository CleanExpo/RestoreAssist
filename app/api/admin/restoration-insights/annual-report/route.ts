/**
 * RA-6917 Phase 2.5 — admin-only annual-report export over the de-identified
 * restoration data asset. Returns an N-anonymity-suppressed yearly report as
 * JSON (default) or CSV (?format=csv), for annual-report / industry outputs.
 *
 * GET /api/admin/restoration-insights/annual-report?year=2026&state=NSW&format=csv
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { fromException } from "@/lib/api-errors";
import {
  buildAnnualReport,
  toAnnualReportCsv,
} from "@/lib/analytics/annualReport";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);

    const yearRaw = searchParams.get("year");
    const year = yearRaw ? Number.parseInt(yearRaw, 10) : NaN;
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: "year query param is required (e.g. 2026)" },
        { status: 400 },
      );
    }

    const state = searchParams.get("state") ?? undefined;
    const format = (searchParams.get("format") ?? "json").toLowerCase();

    const report = await buildAnnualReport(year, { state });

    if (format === "csv") {
      const csv = toAnnualReportCsv(report);
      const suffix = state ? `-${state.toLowerCase()}` : "";
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="restoreassist-annual-report-${year}${suffix}.csv"`,
        },
      });
    }

    return NextResponse.json({ data: report });
  } catch (error) {
    return fromException(request, error);
  }
}
