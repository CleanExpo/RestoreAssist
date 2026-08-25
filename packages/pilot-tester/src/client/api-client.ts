/**
 * Typed API client for the harness.
 *
 * Wraps the 6 endpoints we drive from the orchestrator. Every method
 * carries the run-id header through the AuthenticatedSession so a
 * structured request log (lib/observability.ts on the server) can be
 * filtered to a single harness run.
 */

import { FormData, type RequestInit } from "undici";
import { createHash, randomUUID } from "node:crypto";
import type { AuthenticatedSession } from "./auth.js";
import type {
  AssessmentDomain,
  AssessmentReport,
  EstimateLine,
  EstimateTotals,
  ScopeItem,
  StandardCitation,
} from "@/lib/assessments/types";

export interface CreateInspectionInput {
  propertyAddress: string;
  propertyPostcode: string;
  technicianName?: string;
  lossDescription?: string;
}

export interface CreateInspectionOutput {
  id: string;
  inspectionNumber: string;
  status: string;
}

export interface UploadPhotoInput {
  inspectionId: string;
  buffer: Buffer;
  filename: string;
  mimeType: string;
  /** SHA-256 of the exact bytes. The server must verify and persist it. */
  contentSha256: string;
  meta?: {
    location?: string;
    damageCategory?: string;
    photoStage?: string;
    technicianNotes?: string;
  };
}

export interface UploadedPhotoReceipt {
  id: string;
  cocoaSha256: string;
  fileSize: number;
  mimeType: string;
}

export interface PilotBudgetReservation {
  reservationId: string;
  workspaceId: string;
  ceilingUsd: number;
  spentTodayUsd: number;
  reservedUsd: number;
  expiresAt: string;
}

export interface PilotBudgetReconciliation {
  reservationId: string;
  workspaceId: string;
  generationCostUsd: number;
  judgeCostUsd: number;
  adjusterCostUsd: number;
  failedAttemptCostUsd: number;
  totalActualCostUsd: number;
  reconciledSpentUsd: number;
  reconciledAt: string;
}

export interface PilotJudgeReceipt {
  professionalism: number;
  specificity: number;
  consistency: number;
  actionability: number;
  composite: number;
  rationale: string;
  modelUsed: string;
  costUsd: number;
  latencyMs: number;
}

export interface AffectedAreaInput {
  inspectionId: string;
  roomZoneId: string;
  affectedSquareFootage: number;
  waterSource: string;
  timeSinceLoss?: number;
  description?: string;
}

export interface MoistureReadingInput {
  inspectionId: string;
  location: string;
  surfaceType: string;
  moistureLevel: number;
  depth?: string;
  notes?: string;
}

export interface GenerateAssessmentInput {
  inspectionId: string;
  domain: AssessmentDomain;
  options?: Record<string, unknown> | null;
  enhanceWithAi?: boolean;
}

export interface GenerateAssessmentOutput {
  assessmentGenerationId: string;
  report: AssessmentReport;
  scope: { items: ScopeItem[] };
  estimate: { lines: EstimateLine[]; totals: EstimateTotals };
  citations: StandardCitation[];
  meta: {
    domain: string;
    generatedAt: string;
    modelUsed: string | null;
    latencyMs: number;
    costEstimateUsd: number | null;
    workspaceId: string | null;
  };
}

export class HarnessApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly route: string,
    public readonly body: unknown,
  ) {
    super(
      `[pilot-tester] ${route} returned ${status}: ${typeof body === "string" ? body : JSON.stringify(body)}`,
    );
    this.name = "HarnessApiError";
  }
}

export class ApiClient {
  constructor(
    private readonly session: AuthenticatedSession,
    private readonly baseUrl: string,
  ) {}

  async createInspection(
    input: CreateInspectionInput,
  ): Promise<CreateInspectionOutput> {
    const route = "/api/inspections";
    const res = await this.session.fetch(`${this.baseUrl}${route}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify(input),
    });
    return readJson<CreateInspectionOutput>(res, route);
  }

  async uploadPhoto(input: UploadPhotoInput): Promise<UploadedPhotoReceipt> {
    const route = `/api/inspections/${input.inspectionId}/photos`;
    const fd = new FormData();
    const blob = new Blob([input.buffer as unknown as ArrayBuffer], {
      type: input.mimeType,
    });
    fd.set("file", blob, input.filename);
    fd.set("cocoaSha256", input.contentSha256);
    if (input.meta?.location) fd.set("location", input.meta.location);
    if (input.meta?.damageCategory)
      fd.set("damageCategory", input.meta.damageCategory);
    if (input.meta?.photoStage) fd.set("photoStage", input.meta.photoStage);
    if (input.meta?.technicianNotes)
      fd.set("technicianNotes", input.meta.technicianNotes);

    const res = await this.session.fetch(`${this.baseUrl}${route}`, {
      method: "POST",
      // FormData is supported by undici but TS's BodyInit shape conflicts.
      body: fd,
    } as unknown as Parameters<typeof this.session.fetch>[1]);
    const payload = await readJson<unknown>(res, route);
    const photo = isRecord(payload) && isRecord(payload.photo) ? payload.photo : null;
    if (
      !photo ||
      typeof photo.id !== "string" ||
      photo.id.length === 0 ||
      typeof photo.cocoaSha256 !== "string" ||
      photo.cocoaSha256.toLowerCase() !== input.contentSha256.toLowerCase() ||
      typeof photo.fileSize !== "number" ||
      photo.fileSize !== input.buffer.length ||
      typeof photo.mimeType !== "string" ||
      photo.mimeType !== input.mimeType
    ) {
      throw new Error(`[pilot-tester] ${route} returned an invalid or unbound photo receipt`);
    }
    return {
      id: photo.id,
      cocoaSha256: photo.cocoaSha256.toLowerCase(),
      fileSize: photo.fileSize,
      mimeType: photo.mimeType,
    };
  }

  async assertPhotosPersisted(
    inspectionId: string,
    expected: UploadedPhotoReceipt[],
  ): Promise<void> {
    const route = `/api/inspections/${inspectionId}/photos`;
    const res = await this.session.fetch(`${this.baseUrl}${route}`, { method: "GET" });
    const payload = await readJson<unknown>(res, route);
    const photos = isRecord(payload) && Array.isArray(payload.photos) ? payload.photos : null;
    if (!photos) {
      throw new Error(`[pilot-tester] ${route} returned no persisted photo population`);
    }
    const byId = new Map(
      photos
        .filter(isRecord)
        .filter((photo) => typeof photo.id === "string")
        .map((photo) => [photo.id as string, photo]),
    );
    for (const receipt of expected) {
      const persisted = byId.get(receipt.id);
      if (
        !persisted ||
        persisted.fileSize !== receipt.fileSize ||
        persisted.mimeType !== receipt.mimeType
      ) {
        throw new Error(`[pilot-tester] uploaded photo ${receipt.id} was not read back intact`);
      }
    }
  }

  /**
   * Server-owned, atomic reservation contract. This endpoint intentionally
   * fails closed until the application implements it; a client-side read of
   * usage cannot reserve money against concurrent or final calls.
   */
  async reservePilotBudget(input: {
    workspaceId: string;
    runId: string;
    companyKey: string;
    jobKey: string;
    ceilingUsd: number;
  }): Promise<PilotBudgetReservation> {
    const route = "/api/pilot-tester/budget/reservations";
    const res = await this.session.fetch(`${this.baseUrl}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": stableIdempotencyKey(route, input) },
      body: JSON.stringify(input),
    });
    const value = await readJson<unknown>(res, route);
    if (
      !isRecord(value) ||
      typeof value.reservationId !== "string" ||
      value.reservationId.length === 0 ||
      value.workspaceId !== input.workspaceId ||
      value.ceilingUsd !== input.ceilingUsd ||
      !finiteNonNegative(value.spentTodayUsd) ||
      !finitePositive(value.reservedUsd) ||
      value.spentTodayUsd + value.reservedUsd > input.ceilingUsd ||
      typeof value.expiresAt !== "string" ||
      !Number.isFinite(Date.parse(value.expiresAt)) ||
      Date.parse(value.expiresAt) <= Date.now()
    ) {
      throw new Error(`[pilot-tester] ${route} returned an invalid budget reservation`);
    }
    return value as unknown as PilotBudgetReservation;
  }

  async reconcilePilotBudget(
    reservationId: string,
    expectedWorkspaceId: string,
  ): Promise<PilotBudgetReconciliation> {
    const route = `/api/pilot-tester/budget/reservations/${encodeURIComponent(reservationId)}/reconcile`;
    const res = await this.session.fetch(`${this.baseUrl}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": stableIdempotencyKey(route, { reservationId, expectedWorkspaceId }) },
      body: "{}",
    });
    const value = await readJson<unknown>(res, route);
    if (
      !isRecord(value) ||
      value.reservationId !== reservationId ||
      value.workspaceId !== expectedWorkspaceId ||
      !finiteNonNegative(value.generationCostUsd) ||
      !finiteNonNegative(value.judgeCostUsd) ||
      !finiteNonNegative(value.adjusterCostUsd) ||
      !finiteNonNegative(value.failedAttemptCostUsd) ||
      !finiteNonNegative(value.totalActualCostUsd) ||
      Math.abs(
        value.totalActualCostUsd -
          (value.generationCostUsd +
            value.judgeCostUsd +
            value.adjusterCostUsd +
            value.failedAttemptCostUsd),
      ) > 1e-9 ||
      !finiteNonNegative(value.reconciledSpentUsd) ||
      typeof value.reconciledAt !== "string" ||
      !Number.isFinite(Date.parse(value.reconciledAt))
    ) {
      throw new Error(`[pilot-tester] ${route} returned an incomplete budget reconciliation`);
    }
    return value as unknown as PilotBudgetReconciliation;
  }

  /** The judge must run behind the authenticated sandbox server endpoint so
   * its provider cost is persisted into the reservation before it is returned. */
  async judgePilotAssessment(input: {
    workspaceId: string;
    inspectionId: string;
    assessmentGenerationId: string;
    assessmentSha256: string;
  }): Promise<PilotJudgeReceipt> {
    const route = "/api/pilot-tester/judge";
    const res = await this.session.fetch(`${this.baseUrl}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": stableIdempotencyKey(route, input) },
      body: JSON.stringify(input),
    });
    const value = await readJson<unknown>(res, route);
    if (
      !isRecord(value) ||
      !finiteScore(value.professionalism, 10) ||
      !finiteScore(value.specificity, 10) ||
      !finiteScore(value.consistency, 10) ||
      !finiteScore(value.actionability, 10) ||
      !finiteScore(value.composite, 100) ||
      Math.abs(
        value.composite -
          ((value.professionalism + value.specificity + value.consistency + value.actionability) / 4) * 10,
      ) > 1e-9 ||
      typeof value.rationale !== "string" ||
      typeof value.modelUsed !== "string" || value.modelUsed.length === 0 ||
      !finiteNonNegative(value.costUsd) ||
      !finiteNonNegative(value.latencyMs)
    ) {
      throw new Error(`[pilot-tester] ${route} returned an invalid server judge receipt`);
    }
    return value as unknown as PilotJudgeReceipt;
  }

  async addAffectedArea(input: AffectedAreaInput): Promise<{ id: string }> {
    const route = `/api/inspections/${input.inspectionId}/affected-areas`;
    const { inspectionId: _omit, ...body } = input;
    void _omit;
    const res = await this.session.fetch(`${this.baseUrl}${route}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify(body),
    });
    return readJson<{ id: string }>(res, route);
  }

  async addMoistureReading(
    input: MoistureReadingInput,
  ): Promise<{ id: string }> {
    const route = `/api/inspections/${input.inspectionId}/moisture`;
    const { inspectionId: _omit, ...body } = input;
    void _omit;
    const res = await this.session.fetch(`${this.baseUrl}${route}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify(body),
    });
    return readJson<{ id: string }>(res, route);
  }

  async generateAssessment(
    input: GenerateAssessmentInput,
  ): Promise<GenerateAssessmentOutput> {
    const route = `/api/inspections/${input.inspectionId}/assessments/${input.domain}/generate`;
    const body: Record<string, unknown> = {
      ...(input.options ?? {}),
    };
    if (input.enhanceWithAi) body.enhanceWithAi = true;
    const idempotencyKey = `pilot-generation-${createHash("sha256")
      .update(JSON.stringify({ inspectionId: input.inspectionId, domain: input.domain, body }))
      .digest("hex")}`;
    const res = await this.session.fetch(`${this.baseUrl}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(body),
    });
    return readJson<GenerateAssessmentOutput>(res, route);
  }

  async initClaimProgress(reportId: string): Promise<{ id: string }> {
    const route = `/api/progress/${reportId}/init`;
    const res = await this.session.fetch(`${this.baseUrl}${route}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": randomUUID(),
      },
      body: "{}",
    });
    return readJson<{ id: string }>(res, route);
  }
}

async function readJson<T>(
  res: Awaited<ReturnType<AuthenticatedSession["fetch"]>>,
  route: string,
): Promise<T> {
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    throw new HarnessApiError(res.status, route, parsed);
  }
  return parsed as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function finitePositive(value: unknown): value is number {
  return finiteNonNegative(value) && value > 0;
}

function finiteScore(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
}

function stableIdempotencyKey(route: string, input: unknown): string {
  return `pilot-${createHash("sha256").update(`${route}\n${stableJson(input)}`).digest("hex")}`;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}
