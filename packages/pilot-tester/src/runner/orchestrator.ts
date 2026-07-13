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
import { bootstrapSession, type UserPoolEntry } from "../client/auth.js";
import { assertSandbox } from "../client/safety.js";
import {
  SYNTHETIC_COMPANIES,
  type SyntheticCompany,
} from "../companies/fixtures.js";
import { JOBS, type JobTemplate } from "../jobs/index.js";
import { pickImagesForTopic, readCachedImage } from "../images/source.js";
import { gradeAssessment, type GradedAssessment } from "./grader.js";

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
}

export interface JobResult {
  company: SyntheticCompany;
  job: JobTemplate;
  inspectionId?: string | undefined;
  generationId?: string | undefined;
  graded?: GradedAssessment | undefined;
  error?: string | undefined;
  durationMs: number;
}

export interface RunReport {
  runId: string;
  baseUrl: string;
  startedAt: string;
  finishedAt: string;
  totalMs: number;
  results: JobResult[];
  /** True if every job exited without throwing. Doesn't speak to grading. */
  success: boolean;
}

export async function runHarness(opts: RunOptions): Promise<RunReport> {
  assertSandbox({
    baseUrl: opts.baseUrl,
    databaseUrl: opts.databaseUrl,
  });

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

  const concurrency = Math.max(1, opts.concurrency ?? 3);
  const tasks = companies.flatMap((c) => jobs.map((j) => ({ c, j })));

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
    baseUrl: opts.baseUrl,
    startedAt,
    finishedAt,
    totalMs: finishedMs - startedMs,
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
  try {
    const session = await bootstrapSession({
      baseUrl: opts.baseUrl,
      entry,
      runId: opts.runId,
    });
    const api = new ApiClient(session, opts.baseUrl);

    // 1. Create inspection.
    const inspection = await api.createInspection({
      propertyAddress: opts.company.defaultAddress,
      propertyPostcode: opts.company.defaultPostcode,
      technicianName: opts.job.inspection.technicianName,
      lossDescription: opts.job.inspection.lossDescription,
    });

    // 2. Upload photos (best-effort; harness continues if cache empty).
    if (opts.job.photoCount > 0) {
      try {
        const images = await pickImagesForTopic(
          opts.job.imageTopic,
          opts.job.photoCount,
        );
        for (let i = 0; i < images.length; i++) {
          const cached = await readCachedImage(images[i]);
          await api.uploadPhoto({
            inspectionId: inspection.id,
            buffer: cached.buffer,
            filename: cached.filename,
            mimeType: cached.mimeType,
            meta: {
              location: opts.job.affectedAreas[0]?.roomZoneId ?? "Site",
              photoStage: i === 0 ? "PRE" : "DURING",
            },
          });
        }
      } catch {
        // Photo upload is not gating — assessment generation works
        // without photos. Continue.
      }
    }

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
      generated,
    });

    return {
      company: opts.company,
      job: opts.job,
      inspectionId: inspection.id,
      generationId: generated.assessmentGenerationId,
      graded,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const msg =
      err instanceof HarnessApiError
        ? `${err.route} → ${err.status}`
        : err instanceof Error
          ? err.message
          : String(err);
    return {
      company: opts.company,
      job: opts.job,
      error: msg,
      durationMs: Date.now() - start,
    };
  }
}
