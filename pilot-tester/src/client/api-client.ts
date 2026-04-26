/**
 * Typed API client for the harness.
 *
 * Wraps the 6 endpoints we drive from the orchestrator. Every method
 * carries the run-id header through the AuthenticatedSession so a
 * structured request log (lib/observability.ts on the server) can be
 * filtered to a single harness run.
 */

import { FormData, type RequestInit } from "undici";
import { randomUUID } from "node:crypto";
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
  meta?: {
    location?: string;
    damageCategory?: string;
    photoStage?: string;
    technicianNotes?: string;
  };
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

  async uploadPhoto(input: UploadPhotoInput): Promise<{ id: string }> {
    const route = `/api/inspections/${input.inspectionId}/photos`;
    const fd = new FormData();
    const blob = new Blob([input.buffer as unknown as ArrayBuffer], {
      type: input.mimeType,
    });
    fd.set("file", blob, input.filename);
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
    return readJson<{ id: string }>(res, route);
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
    const res = await this.session.fetch(`${this.baseUrl}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
