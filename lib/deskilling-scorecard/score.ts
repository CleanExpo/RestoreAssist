/**
 * Deskilling Scorecard — Live Scoring Engine (RA-1135)
 *
 * Computes the 4-tier KPI snapshot:
 *   Tier 1 & 3 & 4 — sourced from the latest monthly AI audit (stored in
 *     CronJobRun metadata for the "deskilling-audit" job).
 *   Tier 2 — computed live from LiveTeacherSession.startedAt → Inspection.submittedAt.
 */

import { prisma } from "@/lib/prisma";
import type {
  DeskillingScorecardSnapshot,
  Tier2Result,
  TechnicianScorecardEntry,
  Tier1Result,
  Tier3Result,
  Tier4Result,
} from "./types";

const WINDOW_DAYS = 90;

function windowStart(): Date {
  const d = new Date();
  d.setDate(d.getDate() - WINDOW_DAYS);
  return d;
}

// ─── TIER 2 — TIME-TO-SUBMISSION (live DB query) ──────────────────────────────

export async function computeTier2(since?: Date): Promise<Tier2Result | null> {
  const from = since ?? windowStart();

  // Find inspections that have been submitted and had a LiveTeacherSession
  const sessions = await prisma.liveTeacherSession.findMany({
    where: {
      startedAt: { gte: from },
      inspection: {
        submittedAt: { not: null },
        status: { in: ["SUBMITTED", "PROCESSING", "CLASSIFIED", "SCOPED", "ESTIMATED", "COMPLETED"] },
      },
    },
    select: {
      startedAt: true,
      userId: true,
      inspection: {
        select: {
          submittedAt: true,
          userId: true,
          user: { select: { isJuniorTechnician: true } },
        },
      },
    },
  });

  if (sessions.length === 0) return null;

  const seniorMinutes: number[] = [];
  const juniorMinutes: number[] = [];

  for (const s of sessions) {
    if (!s.inspection.submittedAt) continue;
    const minutes = (s.inspection.submittedAt.getTime() - s.startedAt.getTime()) / 60_000;
    if (minutes < 0 || minutes > 600) continue; // sanity: skip implausible values
    if (s.inspection.user.isJuniorTechnician) {
      juniorMinutes.push(minutes);
    } else {
      seniorMinutes.push(minutes);
    }
  }

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  if (seniorMinutes.length + juniorMinutes.length === 0) return null;

  return {
    seniorAvgMinutes: seniorMinutes.length > 0 ? Math.round(avg(seniorMinutes)) : 0,
    juniorAvgMinutes: juniorMinutes.length > 0 ? Math.round(avg(juniorMinutes)) : 0,
    sampleSize: { senior: seniorMinutes.length, junior: juniorMinutes.length },
    measuredAt: new Date().toISOString(),
    source: "live-data",
  };
}

// ─── AUDIT RESULT RETRIEVAL (Tier 1/3/4) ─────────────────────────────────────

async function getLatestAuditMetadata(): Promise<{
  tier1: Tier1Result | null;
  tier3: Tier3Result | null;
  tier4: Tier4Result | null;
}> {
  const latestRun = await prisma.cronJobRun.findFirst({
    where: { jobName: "deskilling-audit", status: "completed" },
    orderBy: { completedAt: "desc" },
    select: { metadata: true },
  });

  if (!latestRun?.metadata) return { tier1: null, tier3: null, tier4: null };

  try {
    const meta = JSON.parse(latestRun.metadata) as {
      tier1?: Tier1Result;
      tier3?: Tier3Result;
      tier4?: Tier4Result;
    };
    return {
      tier1: meta.tier1 ?? null,
      tier3: meta.tier3 ?? null,
      tier4: meta.tier4 ?? null,
    };
  } catch {
    return { tier1: null, tier3: null, tier4: null };
  }
}

// ─── FULL SNAPSHOT ────────────────────────────────────────────────────────────

export async function getScorecardSnapshot(): Promise<DeskillingScorecardSnapshot> {
  const from = windowStart();
  const [tier2, auditData] = await Promise.all([
    computeTier2(from),
    getLatestAuditMetadata(),
  ]);

  return {
    windowStart: from.toISOString(),
    windowEnd: new Date().toISOString(),
    generatedAt: new Date().toISOString(),
    tier1: auditData.tier1,
    tier2,
    tier3: auditData.tier3,
    tier4: auditData.tier4,
  };
}

// ─── TECHNICIAN LEADERBOARD ───────────────────────────────────────────────────

export async function getTechnicianLeaderboard(since?: Date): Promise<TechnicianScorecardEntry[]> {
  const from = since ?? windowStart();

  const sessions = await prisma.liveTeacherSession.findMany({
    where: {
      startedAt: { gte: from },
      inspection: { submittedAt: { not: null } },
    },
    select: {
      startedAt: true,
      userId: true,
      inspection: {
        select: {
          submittedAt: true,
          user: {
            select: {
              id: true,
              name: true,
              isJuniorTechnician: true,
            },
          },
        },
      },
    },
  });

  // Group by userId
  const byUser = new Map<
    string,
    { name: string | null; isJunior: boolean; minutes: number[]; count: number }
  >();

  for (const s of sessions) {
    if (!s.inspection.submittedAt) continue;
    const uid = s.inspection.user.id;
    if (!byUser.has(uid)) {
      byUser.set(uid, {
        name: s.inspection.user.name,
        isJunior: s.inspection.user.isJuniorTechnician,
        minutes: [],
        count: 0,
      });
    }
    const entry = byUser.get(uid)!;
    const minutes = (s.inspection.submittedAt.getTime() - s.startedAt.getTime()) / 60_000;
    if (minutes >= 0 && minutes <= 600) entry.minutes.push(minutes);
    entry.count++;
  }

  // Build anonymised leaderboard (sorted by avg submission time ascending)
  const entries = Array.from(byUser.entries()).map(([userId, data], idx) => ({
    userId,
    displayName: `Tech #${idx + 1}`,
    isJunior: data.isJunior,
    avgSubmissionMinutes:
      data.minutes.length > 0
        ? Math.round(data.minutes.reduce((a, b) => a + b, 0) / data.minutes.length)
        : null,
    reportCount: data.count,
    avgQualityScore: null,
    avgErrorRate: null,
    avgComplianceRate: null,
  }));

  return entries.sort((a, b) => {
    if (a.avgSubmissionMinutes == null) return 1;
    if (b.avgSubmissionMinutes == null) return -1;
    return a.avgSubmissionMinutes - b.avgSubmissionMinutes;
  });
}
