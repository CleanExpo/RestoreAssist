import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ApprovalStatus } from "@prisma/client";
import { withIdempotency } from "@/lib/idempotency";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; approvalId: string }> },
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id, approvalId } = await params;

  // RA-1266: approval decisions are terminal actions — retry must not
  // flip the decision or record a second respondedAt.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let parsed: { status?: ApprovalStatus; clientComments?: string } = {};
      try {
        parsed = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON body" },
          { status: 400 },
        );
      }
      const { status, clientComments } = parsed;

      const allowedStatuses: ApprovalStatus[] = ["APPROVED", "REJECTED"];
      if (!status || !allowedStatuses.includes(status)) {
        return NextResponse.json(
          {
            error: `Invalid status. Must be one of: ${allowedStatuses.join(", ")}`,
          },
          { status: 400 },
        );
      }

      const approval = await prisma.reportApproval.findFirst({
        where: {
          id: approvalId,
          reportId: id,
          report: { userId },
        },
      });

      if (!approval) {
        return NextResponse.json(
          { error: "Approval not found" },
          { status: 404 },
        );
      }

      const updated = await prisma.reportApproval.update({
        where: { id: approvalId },
        data: {
          status,
          clientComments: clientComments ?? null,
          respondedAt: new Date(),
        },
      });

      return NextResponse.json({ approval: updated });
    } catch (error) {
      console.error("Error responding to approval:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  });
}
