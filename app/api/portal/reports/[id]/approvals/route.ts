import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";
import { requireClientAuth } from "@/lib/portal/require-client-auth";

// RA-8068: the estimate total the client is looking at right now, read
// server-side. Only cost approvals carry an amount.
async function currentEstimateTotal(
  reportId: string,
  approvalType: string,
): Promise<number | null> {
  if (approvalType !== "COST_ESTIMATE") return null;
  const estimate = await prisma.estimate.findFirst({
    where: { reportId },
    orderBy: { createdAt: "desc" },
    select: { totalIncGST: true },
  });
  return estimate?.totalIncGST ?? null;
}

// POST /api/portal/reports/[id]/approvals - Create or update approval (bearer JWT)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireClientAuth(request);
  if (!auth.ok) return auth.response;

  const clientId = auth.claims.clientId;
  const { id: reportId } = await params;

  // RA-1266: find-or-create pattern is race-prone — parallel retries
  // without idempotency can both fail the find and create duplicate rows.
  return withIdempotency(request, clientId, async (rawBody) => {
    try {
      let body: any;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }
      // RA-8068: `amount` is deliberately not read from the body. It is the
      // figure the estimate status route checks against the total, so the
      // client must never be able to set or clear it.
      const { approvalType, status, clientComments } = body;

      // Validate approvalType and status
      if (
        !approvalType ||
        !["SCOPE_OF_WORK", "COST_ESTIMATE"].includes(approvalType)
      ) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid approval type",
          status: 400,
        });
      }

      if (
        !status ||
        !["APPROVED", "REJECTED", "CHANGES_REQUESTED"].includes(status)
      ) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid status",
          status: 400,
        });
      }

      // Verify report belongs to this client
      const report = await prisma.report.findFirst({
        where: {
          id: reportId,
          clientId,
        },
      });

      if (!report) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Report not found",
          status: 404,
        });
      }

      // Check if there's already a pending approval for this type
      const existingApproval = await prisma.reportApproval.findFirst({
        where: {
          reportId,
          approvalType,
          status: "PENDING",
        },
      });

      let approval;

      if (existingApproval) {
        // Update existing approval
        approval = await prisma.reportApproval.update({
          where: { id: existingApproval.id },
          data: {
            status,
            respondedAt: new Date(),
            clientComments: clientComments || null,
            // Keep the restorer's requested amount; a request sent without
            // one is filled from the current estimate total.
            ...(existingApproval.amount === null
              ? { amount: await currentEstimateTotal(reportId, approvalType) }
              : {}),
          },
        });
      } else {
        // No request on file: record the current estimate total.
        const amount = await currentEstimateTotal(reportId, approvalType);
        approval = await prisma.reportApproval.create({
          data: {
            reportId,
            approvalType,
            status,
            respondedAt: new Date(),
            clientComments: clientComments || null,
            amount,
          },
        });
      }

      return NextResponse.json({ approval }, { status: 201 });
    } catch (error) {
      console.error("Error creating/updating approval:", error);
      return fromException(request, error, {
        stage: "portal/reports/approvals:upsert",
      });
    }
  });
}

// GET /api/portal/reports/[id]/approvals - Get approvals for a report
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireClientAuth(request);
    if (!auth.ok) return auth.response;

    const clientId = auth.claims.clientId;
    const { id: reportId } = await params;

    // Verify report belongs to this client
    const report = await prisma.report.findFirst({
      where: {
        id: reportId,
        clientId,
      },
    });

    if (!report) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Report not found",
        status: 404,
      });
    }

    const approvals = await prisma.reportApproval.findMany({
      where: { reportId },
      select: {
        id: true,
        reportId: true,
        approvalType: true,
        status: true,
        amount: true,
        clientComments: true,
        respondedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ approvals });
  } catch (error) {
    console.error("Error fetching approvals:", error);
    return fromException(request, error, {
      stage: "portal/reports/approvals:list",
    });
  }
}
