import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getSubmissionGateRequirements,
  EVIDENCE_CLASSES,
} from "@/lib/evidence";
import type { EvidenceClass, InspectionStatus } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EvidenceGapSummary {
  evidenceClass: EvidenceClass;
  displayName: string;
  required: number;
  captured: number;
}

export interface InspectionEvidenceRow {
  id: string;
  inspectionNumber: string;
  propertyAddress: string;
  claimType: string;
  status: string;
  technicianName: string | null;
  technicianEmail: string | null;
  completionPercentage: number;
  totalRequired: number;
  totalCaptured: number;
  gapCount: number;
  flaggedCount: number;
  rejectedCount: number;
  gaps: EvidenceGapSummary[];
  lastEvidenceAt: string | null;
  createdAt: string;
}

export interface EvidenceReviewSummary {
  totalActiveInspections: number;
  inspectionsWithGaps: number;
  totalFlaggedItems: number;
  averageCompletion: number;
  technicianBreakdown: Array<{
    technicianName: string;
    technicianEmail: string;
    inspectionCount: number;
    avgCompletion: number;
    totalGaps: number;
  }>;
}

// ─── GET /api/admin/evidence-review ──────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Admin/Manager only
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== "ADMIN" && user?.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status"); // e.g. "DRAFT,SUBMITTED"
    const technicianId = searchParams.get("technicianId");
    const gapsOnly = searchParams.get("gapsOnly") === "true";

    // ── Fetch active inspections ──────────────────────────────────────────────
    const defaultStatuses: InspectionStatus[] = [
      "DRAFT",
      "SUBMITTED",
      "PROCESSING",
      "CLASSIFIED",
      "SCOPED",
    ];
    const statuses: InspectionStatus[] = statusFilter
      ? (statusFilter.split(",") as InspectionStatus[])
      : defaultStatuses;

    const inspections = await prisma.inspection.findMany({
      where: {
        status: { in: statuses },
        ...(technicianId ? { userId: technicianId } : {}),
      },
      include: {
        user: { select: { name: true, email: true } },
        evidenceItems: {
          select: {
            evidenceClass: true,
            status: true,
            capturedAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200, // bounded to prevent N+1 at scale
    });

    // ── Per-inspection completeness calculation ───────────────────────────────
    const rows: InspectionEvidenceRow[] = [];
    let totalFlagged = 0;
    let totalCompletion = 0;

    for (const insp of inspections) {
      // Inspection model does not store claimType — default to water_damage.
      // A future migration can add this field when claim-type selection is added
      // to the inspection creation flow.
      const claimType = "water_damage";
      const requirements = getSubmissionGateRequirements(claimType);

      // Count captured (non-rejected) by class
      const capturedCounts = new Map<EvidenceClass, number>();
      let flaggedCount = 0;
      let rejectedCount = 0;
      let lastEvidenceAt: Date | null = null;

      for (const item of insp.evidenceItems) {
        if (item.status === "REJECTED") {
          rejectedCount++;
          continue;
        }
        if (item.status === "FLAGGED") flaggedCount++;
        const cur = capturedCounts.get(item.evidenceClass) ?? 0;
        capturedCounts.set(item.evidenceClass, cur + 1);
        if (!lastEvidenceAt || item.capturedAt > lastEvidenceAt) {
          lastEvidenceAt = item.capturedAt;
        }
      }

      totalFlagged += flaggedCount;

      // Build gaps list
      let totalRequired = 0;
      let totalCaptured = 0;
      const gaps: EvidenceGapSummary[] = [];

      for (const req of requirements) {
        const captured = capturedCounts.get(req.evidenceClass) ?? 0;
        totalRequired += req.minCount;
        totalCaptured += Math.min(captured, req.minCount);

        if (captured < req.minCount) {
          gaps.push({
            evidenceClass: req.evidenceClass,
            displayName: EVIDENCE_CLASSES[req.evidenceClass].displayName,
            required: req.minCount,
            captured,
          });
        }
      }

      const completionPercentage =
        totalRequired > 0
          ? Math.round((totalCaptured / totalRequired) * 100)
          : 100;

      totalCompletion += completionPercentage;

      if (gapsOnly && gaps.length === 0) continue;

      rows.push({
        id: insp.id,
        inspectionNumber: insp.inspectionNumber ?? insp.id.slice(0, 8),
        propertyAddress: insp.propertyAddress ?? "No address",
        claimType,
        status: insp.status,
        technicianName: insp.user?.name ?? null,
        technicianEmail: insp.user?.email ?? null,
        completionPercentage,
        totalRequired,
        totalCaptured,
        gapCount: gaps.length,
        flaggedCount,
        rejectedCount,
        gaps,
        lastEvidenceAt: lastEvidenceAt?.toISOString() ?? null,
        createdAt: insp.createdAt.toISOString(),
      });
    }

    // ── Summary stats ─────────────────────────────────────────────────────────
    const inspectionsWithGaps = rows.filter((r) => r.gapCount > 0).length;
    const averageCompletion =
      rows.length > 0 ? Math.round(totalCompletion / rows.length) : 0;

    // Technician breakdown — group rows by technician
    const techMap = new Map<
      string,
      {
        name: string;
        email: string;
        inspectionCount: number;
        totalCompletion: number;
        totalGaps: number;
      }
    >();

    for (const row of rows) {
      const key = row.technicianEmail ?? "unknown";
      const existing = techMap.get(key);
      if (existing) {
        existing.inspectionCount++;
        existing.totalCompletion += row.completionPercentage;
        existing.totalGaps += row.gapCount;
      } else {
        techMap.set(key, {
          name: row.technicianName ?? "Unknown",
          email: row.technicianEmail ?? "unknown",
          inspectionCount: 1,
          totalCompletion: row.completionPercentage,
          totalGaps: row.gapCount,
        });
      }
    }

    const technicianBreakdown = Array.from(techMap.values())
      .map((t) => ({
        technicianName: t.name,
        technicianEmail: t.email,
        inspectionCount: t.inspectionCount,
        avgCompletion: Math.round(t.totalCompletion / t.inspectionCount),
        totalGaps: t.totalGaps,
      }))
      .sort((a, b) => a.avgCompletion - b.avgCompletion); // worst first

    const summary: EvidenceReviewSummary = {
      totalActiveInspections: inspections.length,
      inspectionsWithGaps,
      totalFlaggedItems: totalFlagged,
      averageCompletion,
      technicianBreakdown,
    };

    return NextResponse.json({ data: rows, summary });
  } catch (error) {
    console.error("Error fetching evidence review:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
