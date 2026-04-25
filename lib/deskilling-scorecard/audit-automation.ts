/**
 * Deskilling Scorecard — Monthly Audit Automation (RA-1135)
 *
 * Runs a blind Claude review of sampled inspections to compute:
 *   Tier 1 — Junior vs Senior quality delta (0–100 scores)
 *   Tier 3 — Scope/equipment/timeline error rate
 *   Tier 4 — Compliance flag catch rate
 *
 * Results are stored in CronJobRun.metadata for "deskilling-audit".
 * Retrieved by score.ts → getLatestAuditMetadata().
 *
 * Invoked by: app/api/cron/deskilling-audit/route.ts (monthly Vercel Cron)
 */

import { prisma } from "@/lib/prisma";
import { anthropic } from "@/lib/anthropic";
import { runCronJob, type CronJobResult } from "@/lib/cron/runner";
import type { AuditReportResult, Tier1Result, Tier3Result, Tier4Result } from "./types";

const SAMPLE_SIZE = 40; // 20 junior + 20 senior per spec
const MODEL = "claude-haiku-4-5-20251001"; // cost-efficient for batch review

// ─── SAMPLED INSPECTION TYPE ──────────────────────────────────────────────────

interface SampledInspection {
  id: string;
  isJunior: boolean;
  reportText: string | null;
  scopeSummary: string;
}

// ─── REPORT SAMPLER ───────────────────────────────────────────────────────────

async function sampleInspections(
  isJunior: boolean,
  limit: number,
): Promise<SampledInspection[]> {
  const since = new Date();
  since.setDate(since.getDate() - 90);

  const rows = await prisma.inspection.findMany({
    where: {
      submittedAt: { not: null, gte: since },
      user: { isJuniorTechnician: isJunior },
      status: {
        in: ["SUBMITTED", "PROCESSING", "CLASSIFIED", "SCOPED", "ESTIMATED", "COMPLETED"],
      },
    },
    select: {
      id: true,
      scopeItems: { select: { description: true, quantity: true, unit: true } },
      classifications: { select: { category: true } },
      report: { select: { technicianFieldReport: true } },
    },
    take: limit,
    orderBy: { submittedAt: "desc" },
  });

  return rows.map((row) => ({
    id: row.id,
    isJunior,
    reportText: row.report?.technicianFieldReport ?? null,
    scopeSummary: row.scopeItems
      .map((s) => `• ${s.description} (${s.quantity ?? "?"} ${s.unit ?? ""})`.trim())
      .join("\n"),
  }));
}

// ─── CLAUDE REVIEWER ──────────────────────────────────────────────────────────

async function reviewInspection(insp: SampledInspection): Promise<AuditReportResult> {
  const prompt = `You are a senior restoration industry auditor performing a blind review of a technician inspection report.

TECHNICIAN FIELD REPORT:
${insp.reportText ?? "(no field report text available)"}

SCOPE OF WORKS ITEMS:
${insp.scopeSummary || "(no scope items recorded)"}

Score this report on THREE criteria, responding ONLY with valid JSON matching this schema:
{
  "qualityScore": <0–100 integer, where 100 = comprehensive senior-level report>,
  "hasErrors": <true if scope/equipment/timeline has clear discrepancies, else false>,
  "complianceFlagsCaught": <true if mandatory compliance fields are present (make-safe, AS/NZS 4849.1, SafeWork trigger, NZBS, variation notices), else false>,
  "reviewSummary": "<50 words max summary>"
}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "{}";

  try {
    const parsed = JSON.parse(
      text.replace(/```json\n?|\n?```/g, "").trim(),
    ) as {
      qualityScore: number;
      hasErrors: boolean;
      complianceFlagsCaught: boolean;
      reviewSummary: string;
    };
    return {
      inspectionId: insp.id,
      qualityScore: Math.max(0, Math.min(100, Math.round(parsed.qualityScore))),
      hasErrors: Boolean(parsed.hasErrors),
      complianceFlagsCaught: Boolean(parsed.complianceFlagsCaught),
      reviewSummary: parsed.reviewSummary ?? "",
    };
  } catch {
    // Graceful degradation — don't let a bad parse break the entire audit
    return {
      inspectionId: insp.id,
      qualityScore: 50,
      hasErrors: false,
      complianceFlagsCaught: false,
      reviewSummary: "Parse error — defaulted",
    };
  }
}

// ─── MAIN AUDIT HANDLER ───────────────────────────────────────────────────────

export async function runDeskillingScorecardAudit(): Promise<CronJobResult> {
  return runCronJob("deskilling-audit", async () => {
    const perGroup = Math.floor(SAMPLE_SIZE / 2);

    const [juniorSamples, seniorSamples] = await Promise.all([
      sampleInspections(true, perGroup),
      sampleInspections(false, perGroup),
    ]);

    const allSamples = [...juniorSamples, ...seniorSamples];

    if (allSamples.length === 0) {
      return {
        itemsProcessed: 0,
        metadata: { skipped: "No submitted inspections found in 90-day window" },
      };
    }

    const results: (AuditReportResult & { isJunior: boolean })[] = [];

    for (const insp of allSamples) {
      const result = await reviewInspection(insp);
      results.push({ ...result, isJunior: insp.isJunior });
    }

    // ── Tier 1: Quality delta ──────────────────────────────────────────────────
    const juniorScores = results
      .filter((r) => r.isJunior)
      .map((r) => r.qualityScore);
    const seniorScores = results
      .filter((r) => !r.isJunior)
      .map((r) => r.qualityScore);

    const avg = (arr: number[]) =>
      arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    const seniorAvg = Math.round(avg(seniorScores));
    const juniorAvg = Math.round(avg(juniorScores));

    const tier1: Tier1Result = {
      seniorAvgScore: seniorAvg,
      juniorAvgScore: juniorAvg,
      delta: seniorAvg - juniorAvg,
      sampleSize: { senior: seniorScores.length, junior: juniorScores.length },
      measuredAt: new Date().toISOString(),
      source: "ai-audit",
    };

    // ── Tier 3: Error rate ─────────────────────────────────────────────────────
    const withErrors = results.filter((r) => r.hasErrors).length;
    const tier3: Tier3Result = {
      errorRate: results.length > 0 ? withErrors / results.length : 0,
      sampledCount: results.length,
      flaggedCount: withErrors,
      measuredAt: new Date().toISOString(),
      source: "ai-audit",
    };

    // ── Tier 4: Compliance catch rate ──────────────────────────────────────────
    const complianceCaught = results.filter((r) => r.complianceFlagsCaught).length;
    const tier4: Tier4Result = {
      catchRate: results.length > 0 ? complianceCaught / results.length : 0,
      sampledCount: results.length,
      caughtCount: complianceCaught,
      measuredAt: new Date().toISOString(),
      source: "ai-audit",
    };

    return {
      itemsProcessed: results.length,
      metadata: { tier1, tier3, tier4 },
    };
  });
}
