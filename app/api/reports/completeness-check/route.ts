import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface Section {
  name: string;
  score: number; // 0-100
  status: "complete" | "partial" | "missing";
  issues: string[];
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { reportId } = await request.json();

    if (!reportId) {
      return NextResponse.json(
        { error: "reportId is required" },
        { status: 400 },
      );
    }

    const report = await prisma.report.findFirst({
      where: { id: reportId, userId: session.user.id },
      include: {
        client: true,
        inspection: {
          include: {
            moistureReadings: true,
            affectedAreas: true,
            classifications: true,
            scopeItems: true,
            costEstimates: true,
            photos: true,
          },
        },
      },
    });

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const sections: Section[] = [];

    // --- Client Information ---
    const clientIssues: string[] = [];
    if (!report.client?.name) clientIssues.push("Client name missing");
    if (!report.client?.email) clientIssues.push("Client email missing");
    if (!report.client?.phone) clientIssues.push("Client phone missing");
    sections.push({
      name: "Client Information",
      score:
        clientIssues.length === 0 ? 100 : clientIssues.length === 1 ? 66 : 33,
      status:
        clientIssues.length === 0
          ? "complete"
          : clientIssues.length <= 1
            ? "partial"
            : "missing",
      issues: clientIssues,
    });

    // --- Inspection Data ---
    const insp = report.inspection;
    const inspIssues: string[] = [];
    if (!insp) {
      inspIssues.push("No inspection linked to this report");
    } else {
      if (!insp.environmentalData)
        inspIssues.push("Environmental data not recorded");
      if (insp.moistureReadings.length === 0)
        inspIssues.push("No moisture readings recorded");
      if (insp.affectedAreas.length === 0)
        inspIssues.push("No affected areas defined");
    }
    sections.push({
      name: "Inspection Data",
      score:
        inspIssues.length === 0
          ? 100
          : Math.max(0, 100 - inspIssues.length * 25),
      status:
        inspIssues.length === 0
          ? "complete"
          : inspIssues.length <= 1
            ? "partial"
            : "missing",
      issues: inspIssues,
    });

    // --- IICRC Classification ---
    const classIssues: string[] = [];
    if (!insp || insp.classifications.length === 0)
      classIssues.push("IICRC classification not run");
    sections.push({
      name: "IICRC Classification",
      score: classIssues.length === 0 ? 100 : 0,
      status: classIssues.length === 0 ? "complete" : "missing",
      issues: classIssues,
    });

    // --- Scope of Works ---
    const scopeIssues: string[] = [];
    if (!insp || insp.scopeItems.length === 0)
      scopeIssues.push("No scope items generated");
    sections.push({
      name: "Scope of Works",
      score: scopeIssues.length === 0 ? 100 : 0,
      status: scopeIssues.length === 0 ? "complete" : "missing",
      issues: scopeIssues,
    });

    // --- Cost Estimates ---
    const costIssues: string[] = [];
    if (!insp || insp.costEstimates.length === 0)
      costIssues.push("No cost estimates calculated");
    sections.push({
      name: "Cost Estimates",
      score: costIssues.length === 0 ? 100 : 0,
      status: costIssues.length === 0 ? "complete" : "missing",
      issues: costIssues,
    });

    // --- Site Photos ---
    const photoIssues: string[] = [];
    if (!insp || insp.photos.length === 0) {
      photoIssues.push("No site photos uploaded");
    } else if (insp.photos.length < 3) {
      photoIssues.push("Consider adding more photos (minimum 3 recommended)");
    }
    sections.push({
      name: "Site Photos",
      score: photoIssues.length === 0 ? 100 : 50,
      status: photoIssues.length === 0 ? "complete" : "partial",
      issues: photoIssues,
    });

    const overallScore = Math.round(
      sections.reduce((sum, s) => sum + s.score, 0) / sections.length,
    );

    return NextResponse.json({
      reportId,
      reportTitle: report.reportNumber ?? reportId,
      overallScore,
      sections,
    });
  } catch (error) {
    console.error("[Completeness Check] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
