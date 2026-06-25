import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { lookupPortalAccount } from "@/lib/portal/lookup-portal-account";
import { applyRateLimit } from "@/lib/rate-limiter";
import { buildClientStatusFeed } from "@/lib/portal/client-status-feed";
import { apiError, fromException } from "@/lib/api-errors";

/**
 * Client-portal live updates feed (client portal Phase 4).
 *
 * Pollable, client-safe projection of the claim's current state — status step +
 * progress %, report-ready, and any approvals the client still owes. Read scope
 * only, resolved from the portal token's client. Built from stable status /
 * workflow / report-approval fields (no internal AuditLog jargon leaks).
 */

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;

    const limited = await applyRateLimit(request, {
      prefix: "portal-updates",
      key: token,
      windowMs: 10 * 60 * 1000,
      maxRequests: 120, // pollable
      failClosedOnUpstashError: true,
    });
    if (limited) return limited;

    const account = await lookupPortalAccount(token);
    if (!account) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "invalid_or_expired_link",
        status: 404,
      });
    }

    const inspection = await prisma.inspection.findFirst({
      where: { report: { clientId: account.clientId } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        report: { select: { id: true, status: true } },
      },
    });
    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "no_claim",
        status: 404,
      });
    }

    const [workflow, pendingApprovals] = await Promise.all([
      prisma.inspectionWorkflow.findUnique({
        where: { inspectionId: inspection.id },
        select: { submissionScore: true },
      }),
      inspection.report
        ? // ra-query-ok: pending approvals for one report
          prisma.reportApproval.findMany({
            where: { reportId: inspection.report.id, status: "PENDING" },
            select: { id: true, approvalType: true },
          })
        : Promise.resolve([]),
    ]);

    const feed = buildClientStatusFeed({
      status: inspection.status,
      workflow,
      reportStatus: inspection.report?.status ?? null,
      pendingApprovals,
    });

    return NextResponse.json({ data: feed });
  } catch (err) {
    return fromException(request, err, { stage: "portal/updates:get" });
  }
}
