import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateInsurerToken } from "@/lib/portal-token";

/**
 * POST /api/reports/[id]/insurer-link
 * Generates a signed, tokenised insurer share link for a report.
 * Token is HMAC-signed, valid for 30 days.
 * The resulting URL (/portal/insurer/[token]) requires no login.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const report = await prisma.report.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true, reportNumber: true, propertyAddress: true },
    });

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const token = generateInsurerToken(report.id);
    const baseUrl =
      process.env.NEXTAUTH_URL?.replace(/\/$/, "") ??
      "https://restoreassist.com.au";
    const url = `${baseUrl}/portal/insurer/${token}`;

    return NextResponse.json({
      url,
      token,
      expiresInDays: 30,
      reportNumber: report.reportNumber,
      propertyAddress: report.propertyAddress,
    });
  } catch (error) {
    console.error("[insurer-link] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
