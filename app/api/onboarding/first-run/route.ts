import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface FirstRunStep {
  id: string;
  title: string;
  description: string;
  href: string;
  completed: boolean;
}

export interface FirstRunChecklistResponse {
  dismissed: boolean;
  allComplete: boolean;
  completedCount: number;
  totalCount: number;
  steps: FirstRunStep[];
}

export async function GET(
  _request: NextRequest,
): Promise<NextResponse<FirstRunChecklistResponse>> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      {
        dismissed: false,
        allComplete: false,
        completedCount: 0,
        totalCount: 3,
        steps: [],
      },
      { status: 401 },
    );
  }

  const userId = session.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstRunChecklistDismissedAt: true },
  });

  if (user?.firstRunChecklistDismissedAt) {
    return NextResponse.json({
      dismissed: true,
      allComplete: true,
      completedCount: 3,
      totalCount: 3,
      steps: [],
    });
  }

  const [inspectionCount, readingCount, reportCount] = await Promise.all([
    prisma.inspection.count({ where: { userId } }),
    prisma.moistureReading.count({ where: { inspection: { userId } } }),
    prisma.report.count({ where: { userId } }),
  ]);

  const steps: FirstRunStep[] = [
    {
      id: "create_inspection",
      title: "Create your first inspection",
      description: "Capture field data for a water damage job",
      href: "/dashboard/inspections/new",
      completed: inspectionCount > 0,
    },
    {
      id: "add_readings",
      title: "Add moisture readings",
      description:
        "Log S500:2025-compliant moisture data across affected areas",
      href: "/dashboard/inspections",
      completed: readingCount > 0,
    },
    {
      id: "generate_report",
      title: "Generate AI report",
      description:
        "Create an insurance-grade IICRC S500:2025 compliance report",
      href: "/dashboard/reports/new",
      completed: reportCount > 0,
    },
  ];

  const completedCount = steps.filter((s) => s.completed).length;
  const allComplete = completedCount === steps.length;

  return NextResponse.json({
    dismissed: false,
    allComplete,
    completedCount,
    totalCount: steps.length,
    steps,
  });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  if (body?.action === "dismiss") {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { firstRunChecklistDismissedAt: new Date() },
    });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
