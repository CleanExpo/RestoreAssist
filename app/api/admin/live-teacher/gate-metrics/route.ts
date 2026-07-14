import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { fromException } from "@/lib/api-errors";
import {
  computeCostRollup,
  computeCitationMetrics,
  computeCompletenessDelta,
  type CostRollupRow,
} from "@/lib/live-teacher/gate-metrics";
import {
  buildCorpusIndex,
  collectDistinctPairs,
} from "@/lib/live-teacher/citation-validity";
import {
  computeReportCompletenessSections,
  overallScoreFromSections,
} from "@/lib/reports/completeness";

// Bounded cohort pull for citation classification. Pilot volume is far below
// this; a larger cohort should paginate.
const MAX_UTTERANCES = 20000;
const MAX_REPORTS = 5000;

// RA-7053: read-only ANALYSIS layer over durably-stored Live Teacher data.
// Clones the auth/response/org-scope pattern of app/api/admin/usage/route.ts.
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  // Re-validates role from DB to prevent a stale JWT role granting admin access
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;
  const { user: adminUser } = auth;

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const from = fromParam
    ? new Date(fromParam)
    : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = toParam
    ? new Date(toParam)
    : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  try {
    // ── Part 1: per-inspection cost rollup ────────────────────────────────
    const costGroups = await prisma.liveTeacherSession.groupBy({
      by: ["inspectionId"],
      where: { startedAt: { gte: from, lte: to } },
      _sum: { totalCostAudCents: true },
      _count: { _all: true },
    });
    const costRows: CostRollupRow[] = costGroups.map((g) => ({
      inspectionId: g.inspectionId,
      sumCents: g._sum.totalCostAudCents ?? 0,
      sessionCount: g._count._all,
    }));
    const cost = computeCostRollup(costRows);

    // In-flight (endedAt: null) sessions are counted — cost is incremented per
    // turn, so an open session already carries spend.
    const openSessions = await prisma.liveTeacherSession.count({
      where: { startedAt: { gte: from, lte: to }, endedAt: null },
    });

    // ── Part 2: citation-error classification ─────────────────────────────
    const assistantUtterances = await prisma.teacherUtterance.findMany({
      where: {
        role: "assistant",
        session: { startedAt: { gte: from, lte: to } },
      },
      select: { sessionId: true, clauseRefs: true },
      take: MAX_UTTERANCES,
    });
    const allRefs = assistantUtterances.flatMap((u) => u.clauseRefs);
    const pairs = collectDistinctPairs(allRefs);
    const corpusRows =
      pairs.length > 0
        ? await prisma.standardsChunk.findMany({
            where: {
              OR: pairs.map((p) => ({
                standard: p.standard,
                clause: p.clause,
              })),
            },
            select: { standard: true, edition: true, clause: true },
            take: pairs.length,
          })
        : [];
    const corpus = buildCorpusIndex(corpusRows);
    const citations = computeCitationMetrics(assistantUtterances, corpus);

    // ── Part 3: completeness delta (assisted vs control) ──────────────────
    const reports = await prisma.report.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        inspection: { isNot: null },
        user: { organizationId: adminUser!.organizationId },
      },
      select: {
        reportNumber: true,
        scopeOfWorksDocument: true,
        costEstimationDocument: true,
        totalCost: true,
        client: { select: { name: true, email: true, phone: true } },
        authorityForms: {
          where: { status: "COMPLETED" },
          select: { id: true },
        },
        inspection: {
          select: {
            floorPlanImageUrl: true,
            powerCircuits: true,
            powerCircuitRatingA: true,
            contentsManifestDraft: true,
            moistureReadings: { select: { id: true } },
            affectedAreas: { select: { id: true } },
            classifications: { select: { id: true } },
            scopeItems: { select: { id: true } },
            costEstimates: { select: { id: true } },
            photos: { select: { id: true } },
            claimSketches: { select: { id: true, renderedPngUrl: true } },
            liveTeacherSessions: { select: { id: true }, take: 1 },
          },
        },
      },
      take: MAX_REPORTS,
    });
    const assistedScores: number[] = [];
    const controlScores: number[] = [];
    for (const r of reports) {
      const score = overallScoreFromSections(
        computeReportCompletenessSections(r),
      );
      const assisted = (r.inspection?.liveTeacherSessions?.length ?? 0) > 0;
      (assisted ? assistedScores : controlScores).push(score);
    }
    const completeness = computeCompletenessDelta(assistedScores, controlScores);

    const cohortSessions = costRows.reduce((n, r) => n + r.sessionCount, 0);

    return NextResponse.json({
      data: {
        cost,
        citations,
        completeness,
        cohort: {
          sessions: cohortSessions,
          inspectionsMeasured: cost.inspectionsMeasured,
          openSessions,
        },
        meta: {
          from: from.toISOString(),
          to: to.toISOString(),
          organizationId: adminUser!.organizationId,
          notes: [
            `In-flight (open) sessions counted in cost: ${openSessions} — cost is incremented per turn.`,
            "Citation error rate = fabricated-clause refs (no such clause) / total refs; edition mismatches are SOFT (single-edition corpus) and excluded from the gate.",
            "Completeness delta is observational (non-randomised): assisted = inspection had at least one Live Teacher session, control = none. Confounding is possible.",
            "Cohort is the single-org pilot window (LiveTeacherSession carries no organisation column); completeness is scoped to the admin's organisation.",
          ],
        },
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "gate-metrics" });
  }
}
