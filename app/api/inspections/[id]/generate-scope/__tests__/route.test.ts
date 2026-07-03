import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const inspectionFindFirst = vi.fn();
const safeRetrieveSimilarJobs = vi.fn();
const resolveWorkspaceAiKey = vi.fn();
const generateScopeStream = vi.fn();

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
  getClaimTypePrompt: () => "system prompt",
  getMultiClaimPrompt: () => "multi system prompt",
}));
vi.mock("@/lib/services/ai/generate-scope", () => ({
  generateScopeStream: (...args: unknown[]) => generateScopeStream(...args),
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

function postRequest() {
  return new NextRequest(
    "http://localhost/api/inspections/inspection_1/generate-scope",
    {
      method: "POST",
      body: JSON.stringify({ affectedAreaM2: 42 }),
    },
  );
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
});
