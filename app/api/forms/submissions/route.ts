import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const formType = searchParams.get("formType");
  const search = searchParams.get("search");

  try {
    const where: any = { userId: session.user.id };
    if (status) where.status = status;
    if (search)
      where.submissionNumber = { contains: search, mode: "insensitive" };

    const submissions = await prisma.formSubmission.findMany({
      where,
      include: {
        template: { select: { name: true, formType: true } },
        signatures: { select: { id: true, signedAt: true } },
        report: { select: { title: true } },
      },
      orderBy: { startedAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ submissions });
  } catch (error) {
    return fromException(request, error, { stage: "list" });
  }
}
