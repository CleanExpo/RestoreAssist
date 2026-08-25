/**
 * Orchestrator — companies × jobs × N iterations.
 *
 * Hot path:
 *   for each company in scope:
 *     bootstrap one auth cookie via /api/auth/credentials
 *     for each job in scope (bounded concurrency):
 *       create inspection
 *       upload N photos (cached from manifest)
 *       seed affected areas + moisture readings
 *       generate assessment
 *       grade (deterministic + adjuster)
 *
 * Returns a structured RunReport. The reporter renders it to markdown
 * + JSON. CLI logs each step inline so the operator gets feedback
 * without waiting for the full run.
 */

import { randomUUID } from "node:crypto";
import { ApiClient, HarnessApiError } from "../client/api-client.js";
import {
  assertExactUserPool,
  bootstrapSession,
  type UserPoolEntry,
} from "../client/auth.js";
import type { GenerateAssessmentOutput } from "../client/api-client.js";
import { assertSandbox, probeSandboxRuntimeRevision } from "../client/safety.js";
import {
  SYNTHETIC_COMPANIES,
  type SyntheticCompany,
} from "../companies/fixtures.js";
import { JOBS, type JobTemplate } from "../jobs/index.js";
import { pickImagesForTopic, readCachedImage } from "../images/source.js";
import { gradeAssessment, type GradedAssessment } from "./grader.js";
import { sha256Json } from "./evidence.js";
import type {
  PilotBudgetReconciliation,
  PilotBudgetReservation,
  UploadedPhotoReceipt,
} from "../client/api-client.js";

const MAX_DAILY_BUDGET_USD = 5;

export interface RunOptions {
  baseUrl: string;
  databaseUrl?: string | undefined;
  userPool: UserPoolEntry[];
  /** Filter to a single company key; undefined = all. */
  companyKey?: string | undefined;
  /** Filter to a single job key; undefined = all. */
  jobKey?: string | undefined;
  /** Concurrency across (company × job) pairs. Default 3. */
  concurrency?: number;
  /** Stable run-id; defaults to a fresh UUID. */
  runId?: string;
  /** Exact source revision exercised by this run. */
  revision?: string;
  /** Hard ceiling for observed pilot spend per company. */
  dailyBudgetUsd?: number;
}

export interface JobResult {
  company: SyntheticCompany;
  job: JobTemplate;
  inspectionId?: string | undefined;
  generationId?: string | undefined;
  pilotEmail?: string | undefined;
  workspaceId?: string | undefined;
  imageEvidence?: Array<{ cacheKey: string; contentSha256: string; photoId: string }> | undefined;
  /** Canonical fixture input bound before any network request. */
  inputSha256?: string | undefined;
  /** Exact generated assessment retained so its digest can be rechecked. */
  generatedAssessment?: GenerateAssessmentOutput | undefined;
  outputSha256?: string | undefined;
  graded?: GradedAssessment | undefined;
  budgetEvidence?: (PilotBudgetReconciliation & {
    reservedUsd: number;
    startingSpentUsd: number;
    ceilingUsd: number;
  }) | undefined;
  error?: string | undefined;
  durationMs: number;
}

export interface RunReport {
  runId: string;
  revision: string;
  baseUrl: string;
  startedAt: string;
  finishedAt: string;
  totalMs: number;
  dailyBudgetUsd: number;
  results: JobResult[];
  /** True if every job exited without throwing. Doesn't speak to grading. */
  success: boolean;
}

export async function runHarness(opts: RunOptions): Promise<RunReport> {
  assertSandbox({
    baseUrl: opts.baseUrl,
    databaseUrl: opts.databaseUrl,
  });
  assertExactUserPool(opts.userPool);

  const revision = opts.revision ?? process.env.PILOT_TESTER_REVISION ?? process.env.GITHUB_SHA;
  if (typeof revision !== "string" || !/^[0-9a-f]{40}$/i.test(revision)) {
    throw new Error("[pilot-tester] a 40-character PILOT_TESTER_REVISION/GITHUB_SHA is required");
  }
  const runtimeRevision = await probeSandboxRuntimeRevision(opts.baseUrl, revision);
  const dailyBudgetUsd = opts.dailyBudgetUsd ?? readDailyBudget();

  const runId = opts.runId ?? randomUUID();
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();

  const companies = opts.companyKey
    ? SYNTHETIC_COMPANIES.filter((c) => c.key === opts.companyKey)
    : SYNTHETIC_COMPANIES;
  const jobs = opts.jobKey ? JOBS.filter((j) => j.key === opts.jobKey) : JOBS;

  if (companies.length === 0) {
    throw new Error(
      `[pilot-tester] no companies match filter ${opts.companyKey}`,
    );
  }
  if (jobs.length === 0) {
    throw new Error(`[pilot-tester] no jobs match filter ${opts.jobKey}`);
  }

  // Interleave companies so no slice starts two spend-producing jobs for the
  // same workspace. This keeps the pre-call daily budget proof meaningful.
  const concurrency = Math.min(companies.length, Math.max(1, opts.concurrency ?? 3));
  const tasks = jobs.flatMap((j) => companies.map((c) => ({ c, j })));

  const results: JobResult[] = [];
  for (let i = 0; i < tasks.length; i += concurrency) {
    const slice = tasks.slice(i, i + concurrency);
    const settled = await Promise.all(
      slice.map((t) =>
        runOne({
          baseUrl: opts.baseUrl,
          runId,
          userPool: opts.userPool,
          company: t.c,
          job: t.j,
          dailyBudgetUsd,
        }),
      ),
    );
    results.push(...settled);
    for (const r of settled) {
      const tag = r.error ? "✗" : r.graded?.fullyGraded ? "✓" : "·";
      const score = r.graded?.deterministic?.composite;
      // eslint-disable-next-line no-console
      console.log(
        `${tag} ${r.company.key}/${r.job.key} (${r.durationMs}ms${score !== undefined ? `, det=${score.toFixed(0)}` : ""}${r.error ? ` — ${r.error}` : ""})`,
      );
    }
  }

  const finishedAt = new Date().toISOString();
  const finishedMs = Date.now();
  return {
    runId,
    revision: runtimeRevision,
    baseUrl: opts.baseUrl,
    startedAt,
    finishedAt,
    totalMs: finishedMs - startedMs,
    dailyBudgetUsd,
    results,
    success: results.every((r) => !r.error),
  };
}

interface OneTaskOpts {
  baseUrl: string;
  runId: string;
  userPool: UserPoolEntry[];
  company: SyntheticCompany;
  job: JobTemplate;
  dailyBudgetUsd: number;
}

async function runOne(opts: OneTaskOpts): Promise<JobResult> {
  const start = Date.now();
  const entry = opts.userPool.find((u) => u.companyKey === opts.company.key);
  if (!entry) {
    return {
      company: opts.company,
      job: opts.job,
      error: `no user-pool entry for companyKey=${opts.company.key}`,
      durationMs: Date.now() - start,
    };
  }
  let api: ApiClient | null = null;
  let reservation: PilotBudgetReservation | null = null;
  let workspaceId: string | null = null;
  try {
    const session = await bootstrapSession({
      baseUrl: opts.baseUrl,
      entry,
      runId: opts.runId,
    });
    await assertWorkspaceDailyBudget(session.workspaceId, opts.dailyBudgetUsd);
    workspaceId = session.workspaceId;
    api = new ApiClient(session, opts.baseUrl);
    reservation = await api.reservePilotBudget({
      workspaceId: session.workspaceId,
      runId: opts.runId,
      companyKey: opts.company.key,
      jobKey: opts.job.key,
      ceilingUsd: opts.dailyBudgetUsd,
    });
    const images =
      opts.job.photoCount > 0
        ? await pickImagesForTopic(opts.job.imageTopic, opts.job.photoCount)
        : [];
    const imageEvidence: Array<{ cacheKey: string; contentSha256: string; photoId: string }> = [];
    const uploadedReceipts: UploadedPhotoReceipt[] = [];

    // 1. Create inspection.
    const inspection = await api.createInspection({
      propertyAddress: opts.company.defaultAddress,
      propertyPostcode: opts.company.defaultPostcode,
      technicianName: opts.job.inspection.technicianName,
      lossDescription: opts.job.inspection.lossDescription,
    });

    // 2. Upload the expected licensed photo evidence. Missing cache entries or
    // failed uploads invalidate this job: an assessment run without its
    // evidence would answer a different question and must not grade green.
    if (opts.job.photoCount > 0) {
      for (let i = 0; i < images.length; i++) {
        const cached = await readCachedImage(images[i]);
        const receipt = await api.uploadPhoto({
          inspectionId: inspection.id,
          buffer: cached.buffer,
          filename: cached.filename,
          mimeType: cached.mimeType,
          contentSha256: images[i].contentSha256,
          meta: {
            location: opts.job.affectedAreas[0]?.roomZoneId ?? "Site",
            photoStage: i === 0 ? "PRE" : "DURING",
          },
        });
        imageEvidence.push({
          cacheKey: images[i].cacheKey,
          contentSha256: images[i].contentSha256,
          photoId: receipt.id,
        });
        uploadedReceipts.push(receipt);
      }
      await api.assertPhotosPersisted(inspection.id, uploadedReceipts);
    }

    const inputEvidence = {
      company: opts.company,
      job: opts.job,
      pilotEmail: entry.email,
      workspaceId: session.workspaceId,
      images: imageEvidence,
    };

    // 3. Seed affected areas.
    for (const area of opts.job.affectedAreas) {
      await api.addAffectedArea({
        inspectionId: inspection.id,
        ...area,
      });
    }

    // 4. Seed moisture readings.
    for (const reading of opts.job.moistureReadings) {
      await api.addMoistureReading({
        inspectionId: inspection.id,
        ...reading,
      });
    }

    // 5. Generate assessment.
    const generated = await api.generateAssessment({
      inspectionId: inspection.id,
      domain: opts.job.domain,
      options: opts.job.generateOptions ?? null,
      enhanceWithAi: opts.job.enhanceWithAi,
    });

    // 6. Grade.
    const graded = await gradeAssessment({
      inspectionId: inspection.id,
      workspaceId: session.workspaceId,
      actorUserId: session.userId,
      generated,
      judge: api
        .judgePilotAssessment({
          workspaceId: session.workspaceId,
          inspectionId: inspection.id,
          assessmentGenerationId: generated.assessmentGenerationId,
          assessmentSha256: sha256Json(generated),
        })
        .catch(() => null),
    });
    const reconciliation = await api.reconcilePilotBudget(
      reservation.reservationId,
      session.workspaceId,
    );
    if (
      reconciliation.totalActualCostUsd > reservation.reservedUsd ||
      reconciliation.reconciledSpentUsd + 1e-9 <
        reservation.spentTodayUsd + reconciliation.totalActualCostUsd ||
      reconciliation.reconciledSpentUsd > opts.dailyBudgetUsd ||
      Math.abs(reconciliation.generationCostUsd - (graded.costEstimateUsd ?? -1)) > 1e-9 ||
      Math.abs(reconciliation.judgeCostUsd - (graded.judge?.costUsd ?? -1)) > 1e-9 ||
      Math.abs(reconciliation.adjusterCostUsd - (graded.adjuster?.costUsd ?? -1)) > 1e-9 ||
      reconciliation.failedAttemptCostUsd < (graded.adjuster?.failedAttemptCostUsd ?? 0)
    ) {
      throw new Error("[pilot-tester] budget reservation did not reconcile every AI cost");
    }

    return {
      company: opts.company,
      job: opts.job,
      inspectionId: inspection.id,
      generationId: generated.assessmentGenerationId,
      pilotEmail: entry.email,
      workspaceId: session.workspaceId,
      imageEvidence,
      inputSha256: sha256Json(inputEvidence),
      generatedAssessment: generated,
      outputSha256: sha256Json(generated),
      graded,
      budgetEvidence: {
        ...reconciliation,
        reservedUsd: reservation.reservedUsd,
        startingSpentUsd: reservation.spentTodayUsd,
        ceilingUsd: reservation.ceilingUsd,
      },
      durationMs: Date.now() - start,
    };
  } catch (err) {
    let msg =
      err instanceof HarnessApiError
        ? `${err.route} → ${err.status}`
        : err instanceof Error
          ? err.message
          : String(err);
    let budgetEvidence: JobResult["budgetEvidence"];
    if (api && reservation && workspaceId) {
      try {
        const reconciliation = await api.reconcilePilotBudget(
          reservation.reservationId,
          workspaceId,
        );
        if (
          reconciliation.totalActualCostUsd > reservation.reservedUsd ||
          reconciliation.reconciledSpentUsd > opts.dailyBudgetUsd
        ) {
          throw new Error("failed job exceeded its atomic pilot budget reservation");
        }
        budgetEvidence = {
          ...reconciliation,
          reservedUsd: reservation.reservedUsd,
          startingSpentUsd: reservation.spentTodayUsd,
          ceilingUsd: reservation.ceilingUsd,
        };
      } catch (reconcileError) {
        msg += `; budget reconciliation failed: ${
          reconcileError instanceof Error ? reconcileError.message : String(reconcileError)
        }`;
      }
    }
    return {
      company: opts.company,
      job: opts.job,
      error: msg,
      ...(budgetEvidence ? { budgetEvidence } : {}),
      durationMs: Date.now() - start,
    };
  }
}

function readDailyBudget(): number {
  const raw = process.env.PILOT_TESTER_DAILY_BUDGET_USD ?? String(MAX_DAILY_BUDGET_USD);
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > MAX_DAILY_BUDGET_USD) {
    throw new Error(
      `[pilot-tester] PILOT_TESTER_DAILY_BUDGET_USD must be greater than 0 and at most $${MAX_DAILY_BUDGET_USD.toFixed(2)}`,
    );
  }
  return value;
}

export function validateBudgetSnapshot(
  snapshot: { configuredBudgetUsd: number | null; spentTodayUsd: number },
  ceilingUsd: number,
): void {
  // A local environment default says nothing about the remote sandbox's
  // effective default. Require the limit to be persisted on each exact
  // workspace so this process can measure the same value the app enforces.
  const effectiveBudget = snapshot.configuredBudgetUsd;
  if (
    effectiveBudget === null ||
    !Number.isFinite(effectiveBudget) ||
    effectiveBudget <= 0 ||
    effectiveBudget > ceilingUsd ||
    !Number.isFinite(snapshot.spentTodayUsd) ||
    snapshot.spentTodayUsd < 0 ||
    snapshot.spentTodayUsd >= ceilingUsd
  ) {
    throw new Error(
      `[pilot-tester] workspace daily AI budget is absent, over $${ceilingUsd.toFixed(2)}, or exhausted`,
    );
  }
}

async function assertWorkspaceDailyBudget(
  workspaceId: string,
  ceilingUsd: number,
): Promise<void> {
  const { prisma } = await import("@/lib/prisma");
  const [workspace, usage] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { aiDailyBudgetUsd: true },
    }),
    prisma.aiUsageLog.aggregate({
      _sum: { estimatedCostUsd: true },
      where: {
        workspaceId,
        createdAt: {
          gte: new Date(new Date().setUTCHours(0, 0, 0, 0)),
        },
      },
    }),
  ]);
  if (!workspace) {
    throw new Error("[pilot-tester] authenticated sandbox workspace is absent");
  }
  validateBudgetSnapshot(
    {
      configuredBudgetUsd:
        workspace.aiDailyBudgetUsd === null ? null : Number(workspace.aiDailyBudgetUsd),
      spentTodayUsd: Number(usage._sum.estimatedCostUsd ?? 0),
    },
    ceilingUsd,
  );
}
