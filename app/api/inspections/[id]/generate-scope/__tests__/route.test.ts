import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const inspectionFindFirst = vi.fn();
const safeRetrieveSimilarJobs = vi.fn();
const resolveWorkspaceAiKey = vi.fn();
const generateScopeStream = vi.fn();
const assessS500IntakeComplete = vi.fn();
const getClaimTypePrompt = vi.fn((..._args: unknown[]) => "system prompt");

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    inspection: {
      findFirst: (...args: unknown[]) => inspectionFindFirst(...args),
      update: vi.fn(),
    },
    usageEvent: { create: vi.fn() },
    scopeItem: { deleteMany: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/scope-narrative-prompts", () => ({
  buildScopeUserMessage: () => "scope user message",
}));
vi.mock("@/lib/iicrc-dry-standards", () => ({
  getDryStandard: () => ({ dryThreshold: 16 }),
  getMoistureStatus: () => "dry",
}));
vi.mock("@/lib/ai/rag-context", () => ({
  safeRetrieveSimilarJobs: (...args: unknown[]) =>
    safeRetrieveSimilarJobs(...args),
}));
vi.mock("@/lib/ai/claim-type-prompts", () => ({
  getClaimTypePrompt: (...args: unknown[]) => getClaimTypePrompt(...args),
  getMultiClaimPrompt: () => "multi system prompt",
}));
vi.mock("@/lib/services/ai/generate-scope", () => ({
  generateScopeStream: (...args: unknown[]) => generateScopeStream(...args),
}));
// The S500 intake gate has its own suite; here intake is complete unless a
// case says otherwise.
vi.mock("@/lib/compliance/s500-intake-gate", () => ({
  assessS500IntakeComplete: (...args: unknown[]) =>
    assessS500IntakeComplete(...args),
}));
vi.mock("@/lib/ai/resolve-workspace-ai-key", () => ({
  resolveWorkspaceAiKey: (...args: unknown[]) => resolveWorkspaceAiKey(...args),
  NoWorkspaceKeyError: class NoWorkspaceKeyError extends Error {},
}));

import { POST } from "../route";

beforeEach(() => {
  getServerSession.mockReset();
  userFindUnique.mockReset();
  inspectionFindFirst.mockReset();
  safeRetrieveSimilarJobs.mockReset();
  resolveWorkspaceAiKey.mockReset();
  generateScopeStream.mockReset();
  assessS500IntakeComplete.mockReset();
  getClaimTypePrompt.mockClear();
  assessS500IntakeComplete.mockResolvedValue({ ok: true });

  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  userFindUnique.mockResolvedValue({
    id: "user_1",
    subscriptionStatus: "ACTIVE",
  });
  inspectionFindFirst.mockResolvedValue({
    propertyAddress: "1 Test St, Brisbane, QLD",
    inspectionDate: new Date("2026-07-01T00:00:00.000Z"),
    moistureReadings: [],
    environmentalData: [],
    classifications: [{ category: "2", class: "2" }],
    scopeItems: [],
  });
  safeRetrieveSimilarJobs.mockResolvedValue({ jobCount: 0, contextPrompt: "" });
  resolveWorkspaceAiKey.mockResolvedValue({
    workspaceId: "ws_1",
    apiKey: "sk-ant-workspace",
  });
});

function postRequest(extra: Record<string, unknown> = {}) {
  return new NextRequest(
    "http://localhost/api/inspections/inspection_1/generate-scope",
    {
      method: "POST",
      body: JSON.stringify({ affectedAreaM2: 42, ...extra }),
    },
  );
}

function emptyStream() {
  return {
    [Symbol.asyncIterator]: () => ({
      next: async () => ({ done: true, value: undefined }),
    }),
    abort: vi.fn(),
  };
}

describe("POST /api/inspections/[id]/generate-scope", () => {
  it("returns 402 with the NoWorkspaceKeyError shape when the workspace has no key", async () => {
    const { NoWorkspaceKeyError } = await import(
      "@/lib/ai/resolve-workspace-ai-key"
    );
    resolveWorkspaceAiKey.mockRejectedValueOnce(
      new NoWorkspaceKeyError("ANTHROPIC"),
    );

    const response = await POST(postRequest(), {
      params: Promise.resolve({ id: "inspection_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body.error.code).toBe("PAYMENT_REQUIRED");
    // The streaming customer workload must never open the upstream stream on
    // no key — the 402 is a clean JSON response, not a mid-stream error.
    expect(generateScopeStream).not.toHaveBeenCalled();
  });

  it("returns 422 naming the S500 intake gaps and never opens the stream", async () => {
    assessS500IntakeComplete.mockResolvedValueOnce({
      ok: false,
      gaps: ["WATER_CATEGORY_CLASS", "INCIDENT_DATE"],
    });

    const response = await POST(postRequest(), {
      params: Promise.resolve({ id: "inspection_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("VALIDATION");
    expect(Object.keys(body.error.fields ?? {})).toEqual([
      "WATER_CATEGORY_CLASS",
      "INCIDENT_DATE",
    ]);
    expect(generateScopeStream).not.toHaveBeenCalled();
  });

  it("threads the resolved workspace key into generateScopeStream", async () => {
    const fakeStream = {
      [Symbol.asyncIterator]: () => ({
        next: async () => ({ done: true, value: undefined }),
      }),
      abort: vi.fn(),
    };
    generateScopeStream.mockResolvedValueOnce({ ok: true, data: fakeStream });

    const response = await POST(postRequest(), {
      params: Promise.resolve({ id: "inspection_1" }),
    });

    expect(response.status).toBe(200);
    expect(generateScopeStream).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        apiKey: "sk-ant-workspace",
      }),
    );
    // Drain the SSE stream so the ReadableStream start() completes cleanly.
    await response.text();
  });

  // RA-8540: the scope writer may use only the condition a human assessor
  // recorded. The route loads it and hands it to the prompt builder; with no
  // record it passes null, so the prompt says "none recorded".
  it("passes the assessor-recorded mould condition to the prompt builder", async () => {
    inspectionFindFirst.mockResolvedValueOnce({
      propertyAddress: "1 Test St, Brisbane, QLD",
      inspectionDate: new Date("2026-07-01T00:00:00.000Z"),
      moistureReadings: [],
      environmentalData: [],
      classifications: [{ category: "2", class: "2" }],
      scopeItems: [],
      mouldRemediationAssessment: { mouldConditionLevel: "CONDITION_3" },
    });
    generateScopeStream.mockResolvedValueOnce({ ok: true, data: emptyStream() });

    const response = await POST(postRequest({ claimType: "mould" }), {
      params: Promise.resolve({ id: "inspection_1" }),
    });

    expect(response.status).toBe(200);
    const include = inspectionFindFirst.mock.calls[0]?.[0]?.include;
    expect(include?.mouldRemediationAssessment).toEqual({
      select: { mouldConditionLevel: true },
    });
    expect(getClaimTypePrompt).toHaveBeenCalledWith(
      "mould",
      expect.objectContaining({ recordedMouldCondition: "CONDITION_3" }),
    );
    await response.text();
  });

  it("passes no mould condition when no assessor has recorded one", async () => {
    generateScopeStream.mockResolvedValueOnce({ ok: true, data: emptyStream() });

    const response = await POST(postRequest({ claimType: "mould" }), {
      params: Promise.resolve({ id: "inspection_1" }),
    });

    expect(response.status).toBe(200);
    expect(getClaimTypePrompt).toHaveBeenCalledWith(
      "mould",
      expect.objectContaining({ recordedMouldCondition: null }),
    );
    await response.text();
  });
});
