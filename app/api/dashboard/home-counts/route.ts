/**
 * GET /api/dashboard/home-counts
 * True totals for the home page's chips, which used to be the length of a
 * capped list page (RA-8093). Any failed count fails the whole response, so a
 * partial object can never read as a real zero.
 *
 * Jobs and reports take the read reach, clients and money the financial one,
 * matching what each list route would show this caller.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { resolveTotalsReach } from "@/lib/auth/assert-tenancy";
import { INACTIVE_INSPECTION_STATUSES } from "@/lib/inspections/active-status";
import { OUTSTANDING_STATUSES } from "@/lib/invoice-status";

export const dynamic = "force-dynamic";

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

    const [read, financial] = await Promise.all([
      resolveTotalsReach<object>(session, "read"),
      resolveTotalsReach<object>(session, "read-financial"),
    ]);
    if (!read.ok || !financial.ok) {
      const denied = !read.ok ? read : (financial as typeof read & { ok: false });
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: denied.reason,
        status: denied.status,
      });
    }

    const [activeJobs, openReports, awaitingPayment, clients] =
      await Promise.all([
        prisma.inspection.count({
          where: {
            ...(read.data as Prisma.InspectionWhereInput),
            status: { notIn: [...INACTIVE_INSPECTION_STATUSES] },
          },
        }),
        prisma.report.count({
          where: {
            ...(read.data as Prisma.ReportWhereInput),
            status: { in: ["DRAFT", "PENDING"] },
          },
        }),
        prisma.invoice.count({
          where: {
            ...(financial.data as Prisma.InvoiceWhereInput),
            status: { in: [...OUTSTANDING_STATUSES] },
          },
        }),
        prisma.client.count({
          where: financial.data as Prisma.ClientWhereInput,
        }),
      ]);

    return NextResponse.json({
      activeJobs,
      openReports,
      awaitingPayment,
      clients,
    });
  } catch (error) {
    return fromException(request, error, { stage: "home-counts:get" });
  }
}
