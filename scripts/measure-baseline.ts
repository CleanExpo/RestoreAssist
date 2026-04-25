/**
 * Deskilling Scorecard — Baseline Measurement (RA-1135)
 *
 * One-shot script that computes Tier 2 baseline from the last 90 days of
 * submitted inspections with LiveTeacher sessions. Tiers 1/3/4 require
 * AI review and are handled by the monthly audit cron.
 *
 * Usage:
 *   pnpm ts-node scripts/measure-baseline.ts
 *
 * Output: JSON to stdout with the baseline numbers. Lock these in as the
 * pre-Live-Teacher baseline before Phase 1 kickoff.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const WINDOW_DAYS = 90;

async function main() {
  const since = new Date();
  since.setDate(since.getDate() - WINDOW_DAYS);

  console.error(`[baseline] Querying last ${WINDOW_DAYS} days (since ${since.toISOString()})…`);

  const sessions = await prisma.liveTeacherSession.findMany({
    where: {
      startedAt: { gte: since },
      inspection: {
        submittedAt: { not: null },
      },
    },
    select: {
      startedAt: true,
      inspection: {
        select: {
          submittedAt: true,
          user: { select: { isJuniorTechnician: true } },
        },
      },
    },
  });

  const seniorMinutes: number[] = [];
  const juniorMinutes: number[] = [];

  for (const s of sessions) {
    if (!s.inspection.submittedAt) continue;
    const minutes = (s.inspection.submittedAt.getTime() - s.startedAt.getTime()) / 60_000;
    if (minutes < 0 || minutes > 600) continue;
    if (s.inspection.user.isJuniorTechnician) {
      juniorMinutes.push(minutes);
    } else {
      seniorMinutes.push(minutes);
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

  const submittedCount = await prisma.inspection.count({
    where: {
      submittedAt: { not: null, gte: since },
    },
  });

  const juniorCount = await prisma.user.count({
    where: { isJuniorTechnician: true },
  });

  const seniorCount = await prisma.user.count({
    where: {
      isJuniorTechnician: false,
      role: "TECHNICIAN",
    },
  });

  const result = {
    measuredAt: new Date().toISOString(),
    windowDays: WINDOW_DAYS,
    windowStart: since.toISOString(),
    tier2: {
      seniorAvgMinutes: avg(seniorMinutes),
      juniorAvgMinutes: avg(juniorMinutes),
      sampleSize: { senior: seniorMinutes.length, junior: juniorMinutes.length },
    },
    context: {
      totalSubmittedInspections: submittedCount,
      juniorTechnicianCount: juniorCount,
      seniorTechnicianCount: seniorCount,
    },
    notes: [
      "Tier 1 (quality delta), Tier 3 (error rate), Tier 4 (compliance rate) require the monthly audit cron.",
      "Run: GET /api/cron/deskilling-audit to populate AI-reviewed tiers.",
      "Hardcoded baselines from admin-burden forensic audit 2026-04-17: delta=28pts, senior=85min, junior=120min, errorRate=30%, complianceRate=20%.",
    ],
  };

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((err) => {
    console.error("[baseline] Error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
