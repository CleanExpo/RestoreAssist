import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { assertReportTenancy } from "@/lib/auth/assert-tenancy";
import { loadReportDeliveryFacts } from "@/lib/reports/six-fact-delivery";

/** GET — six-fact report delivery state (P2 / V1 P1-5). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const { id: reportId } = await params;
    const tenancy = await assertReportTenancy(session, reportId);
    if (!tenancy.ok) {
      return apiError(request, {
        code: tenancy.status === 401 ? "UNAUTHORIZED" : "NOT_FOUND",
        message: tenancy.reason,
        status: tenancy.status,
      });
    }

    const facts = await loadReportDeliveryFacts(prisma, reportId);
    if (!facts) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Report not found",
        status: 404,
      });
    }

    return NextResponse.json({ data: facts });
  } catch (error) {
    return fromException(request, error, { stage: "report-delivery-facts-get" });
  }
}
