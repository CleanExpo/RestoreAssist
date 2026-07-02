import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runAllChecks } from "@/lib/setup/checks";
import { apiError, fromException } from "@/lib/api-errors";

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

    const org = await prisma.organization.findFirst({
      where: { ownerId: session.user.id },
      select: { id: true },
    });
    if (!org) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "No organization for this user",
        status: 404,
      });
    }

    const checks = await runAllChecks(org.id);
    return NextResponse.json({ data: { checks } });
  } catch (err) {
    return fromException(request, err, { stage: "setup/checks:get" });
  }
}
