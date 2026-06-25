import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ApprovalType } from "@prisma/client";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
    }

    const { id } = await params;

    const report = await prisma.report.findFirst({
      where: {
        id,
        userId: session.user.id,
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
      where: { reportId: id },
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
    return fromException(request, error, { stage: "approvals-get" });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;
  const { id } = await params;

  // RA-1266: approval row creation — retry without idempotency creates
  // duplicate PENDING approvals on the same report.
  return withIdempotency(request, userId, async (rawBody) => {
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
      const { approvalType, amount: rawAmount } = body;
      const amount = rawAmount != null ? Number(rawAmount) : null;
      if (amount !== null && (!isFinite(amount) || amount < 0)) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Amount must be a non-negative finite number",
          status: 400,
        });
      }

      // Validate approvalType
      if (
        !approvalType ||
        !Object.values(ApprovalType).includes(approvalType)
      ) {
        return apiError(request, {
          code: "VALIDATION",
          message: `Invalid approvalType. Must be one of: ${Object.values(ApprovalType).join(", ")}`,
          status: 400,
        });
      }

      const report = await prisma.report.findFirst({
        where: {
          id,
          userId,
        },
      });

      if (!report) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Report not found",
          status: 404,
        });
      }

      const approval = await prisma.reportApproval.create({
        data: {
          reportId: id,
          approvalType,
          status: "PENDING",
          amount: amount ?? null,
        },
      });

      return NextResponse.json({ approval }, { status: 201 });
    } catch (error) {
      return fromException(request, error, { stage: "approvals-post" });
    }
  });
}
