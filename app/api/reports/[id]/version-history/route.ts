import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

// GET - Get version history for a report
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

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "User not found",
        status: 404,
      });
    }

    const { id } = await params;

    const report = await prisma.report.findUnique({
      where: { id, userId: user.id },
    });

    if (!report) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Report not found",
        status: 404,
      });
    }

    const versionHistory = report.versionHistory
      ? JSON.parse(report.versionHistory)
      : [
          {
            version: report.reportVersion || 1,
            date: report.createdAt,
            action: "Initial creation",
            changedBy: user.name || user.email,
          },
        ];

    return NextResponse.json({ versionHistory });
  } catch (error) {
    return fromException(request, error, { stage: "version-history-get" });
  }
}

// POST - Add version history entry
export async function POST(
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

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "User not found",
        status: 404,
      });
    }

    const { id } = await params;
    const { action, changes } = await request.json();

    const report = await prisma.report.findUnique({
      where: { id, userId: user.id },
    });

    if (!report) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Report not found",
        status: 404,
      });
    }

    const currentVersion = report.reportVersion || 1;
    const newVersion = currentVersion + 1;

    const existingHistory = report.versionHistory
      ? JSON.parse(report.versionHistory)
      : [];

    const newEntry = {
      version: newVersion,
      date: new Date().toISOString(),
      action: action || "Report regenerated",
      changes: changes || [],
      changedBy: user.name || user.email,
    };

    const updatedHistory = [...existingHistory, newEntry];

    await prisma.report.update({
      where: { id, userId: user.id },
      data: {
        versionHistory: JSON.stringify(updatedHistory),
        reportVersion: newVersion,
        lastEditedBy: user.id,
        lastEditedAt: new Date(),
      },
    });

    return NextResponse.json({
      versionHistory: updatedHistory,
      newVersion,
    });
  } catch (error) {
    return fromException(request, error, { stage: "version-history-post" });
  }
}
