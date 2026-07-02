import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

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
  try {
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

    if ((session?.user as { role?: string } | undefined)?.role === "USER") {
      const auth = await prisma.authorisation.findFirst({
        where: { subjectUserId: userId },
        select: { id: true, subjectLicenceNumber: true, whsCardNumber: true },
      });

      const hasAuth = !!auth?.subjectLicenceNumber && !!auth?.whsCardNumber;

      const steps: FirstRunStep[] = [
        {
          id: "tech_iicrc",
          title: "Add your IICRC certificate",
          description: "Required before you can sign off evidence.",
          href: "/dashboard/settings/credentials?focus=iicrc",
          completed: !!auth?.subjectLicenceNumber,
        },
        {
          id: "tech_whs",
          title: "Add your WHS card",
          description:
            "White Card / WHS RIIWHS204D-... — required for site work.",
          href: "/dashboard/settings/credentials?focus=whs",
          completed: !!auth?.whsCardNumber,
        },
        {
          id: "tech_state",
          title: "Add your state licence (if applicable)",
          description:
            "QBCC, NSW Fair Trading, etc. Optional unless your state requires it.",
          href: "/dashboard/settings/credentials?focus=state",
          completed: !!auth,
        },
      ];

      const completedCount = steps.filter((s) => s.completed).length;
      return NextResponse.json({
        dismissed: hasAuth,
        allComplete: hasAuth,
        completedCount,
        totalCount: steps.length,
        steps,
      });
    }

    const user = await (prisma as any).user.findUnique({
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
          "Log S500:2021-compliant moisture data across affected areas",
        href: "/dashboard/inspections",
        completed: readingCount > 0,
      },
      {
        id: "generate_report",
        title: "Generate AI report",
        description:
          "Create an insurance-grade IICRC S500:2021 compliance report",
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
  } catch (err) {
    return fromException(_request, err, {
      stage: "first-run:get",
    }) as NextResponse<FirstRunChecklistResponse>;
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const body = await request.json().catch(() => ({}));

    if (body?.action === "dismiss") {
      await (prisma as any).user.update({
        where: { id: session.user.id },
        data: { firstRunChecklistDismissedAt: new Date() },
      });
      return NextResponse.json({ success: true });
    }

    return apiError(request, {
      code: "VALIDATION",
      message: "Unknown action",
      status: 400,
    });
  } catch (err) {
    return fromException(request, err, { stage: "first-run:post" });
  }
}
