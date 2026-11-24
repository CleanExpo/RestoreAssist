import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import {
  canEditTraining,
  resolveTrainingViewer,
  staffMemberWhere,
} from "@/lib/training/register-access";
import {
  PAGE_SIZE,
  splitPage,
  staffCursorWhere,
} from "@/lib/training/paging";

/**
 * Mining pilot slice 6: the staff an owner or manager may record training for,
 * a page at a time (?cursor=), optionally narrowed by name or email (?q=).
 * Only current members of the caller's organisation. A technician gets 403:
 * they never see their colleagues through the register.
 */
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
    const viewer = await resolveTrainingViewer(session.user.id);
    if (!canEditTraining(viewer)) {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Only an owner or manager can list staff for the register",
        status: 403,
        stage: "training-staff-get",
      });
    }

    const params = request.nextUrl.searchParams;
    const after = staffCursorWhere(params.get("cursor"));
    const q = (params.get("q") ?? "").trim().slice(0, 100);
    if (after === null) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid cursor",
        status: 400,
      });
    }

    const parts = [
      staffMemberWhere(viewer),
      ...(after ? [after] : []),
      ...(q
        ? [
            {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { email: { contains: q, mode: "insensitive" as const } },
              ],
            },
          ]
        : []),
    ];
    const rows = await prisma.user.findMany({
      where: { AND: parts },
      select: { id: true, name: true, email: true },
      orderBy: { id: "asc" },
      take: PAGE_SIZE + 1,
    });
    const { page, nextCursor } = splitPage(rows, (r) => r.id);

    return NextResponse.json({
      data: {
        staff: page.map((s) => ({ id: s.id, name: s.name || s.email })),
        nextCursor,
      },
    });
  } catch (err) {
    return fromException(request, err, { stage: "training-staff-get" });
  }
}
