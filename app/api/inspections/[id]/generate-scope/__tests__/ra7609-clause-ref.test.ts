/**
 * RA-7609: generate-scope still stuffs the IICRC reference into justification
 * and never writes ScopeItem.clauseRef. Store clauseRefs[0] from
 * determineScopeItems; leave the justification text unchanged.
 *
 * This test must fail on current main before the write is added.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { determineScopeItems } from "@/lib/nir-scope-determination";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const inspectionFindFirst = vi.fn();
const inspectionUpdate = vi.fn().mockResolvedValue({});
const usageEventCreate = vi.fn().mockResolvedValue({});
const safeRetrieveSimilarJobs = vi.fn();
const resolveWorkspaceAiKey = vi.fn();
const generateScopeStream = vi.fn();
const scopeItemCreateMany = vi.fn().mockResolvedValue({ count: 1 });
const scopeItemDeleteMany = vi.fn().mockResolvedValue({ count: 0 });

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    inspection: {
      findFirst: (...args: unknown[]) => inspectionFindFirst(...args),
      update: (...args: unknown[]) => inspectionUpdate(...args),
    },
    usageEvent: { create: (...args: unknown[]) => usageEventCreate(...args) },
    scopeItem: {
      deleteMany: (...args: unknown[]) => scopeItemDeleteMany(...args),
      createMany: (...args: unknown[]) => scopeItemCreateMany(...args),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        scopeItem: {
          deleteMany: scopeItemDeleteMany,
          createMany: scopeItemCreateMany,
        },
      }),
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

const AFFECTED_AREA_M2 = 42;

function postRequest() {
  return new NextRequest(
    "http://localhost/api/inspections/inspection_1/generate-scope",
    {
      method: "POST",
      body: JSON.stringify({ affectedAreaM2: AFFECTED_AREA_M2 }),
    },
  );
}

type CreatedScopeItem = {
  itemType: string;
  description: string;
  justification: string | null;
  clauseRef: string | null | undefined;
};

function createdScopeItems(): CreatedScopeItem[] {
  const call = scopeItemCreateMany.mock.calls[0];
  if (!call) return [];
  return (call[0] as { data: CreatedScopeItem[] }).data;
}

function expectedExtractClauseRef(): string {
  const determined = determineScopeItems({
    category: "2",
    class: "2",
    waterSource: "Clean Water",
    affectedAreas: [
      {
        roomZoneId: "default",
        affectedSquareFootage: AFFECTED_AREA_M2,
      },
    ],
  });
  const extract = determined.find(
    (item) => item.itemType === "extract_standing_water",
  );
  const ref = extract?.clauseRefs?.[0];
  if (!ref) {
    throw new Error(
      "determineScopeItems must yield a clause reference for extract_standing_water",
    );
  }
  return ref;
}

function markdownWithoutInlineCitation(): string {
  return [
    "## 1. Extract Standing Water",
    "",
    "Standing water must be extracted to begin the drying process.",
  ].join("\n");
}

async function* streamMarkdown(text: string) {
  yield {
    type: "content_block_delta",
    delta: { type: "text_delta", text },
  };
}

describe("POST /api/inspections/[id]/generate-scope — RA-7609 clauseRef", () => {
  beforeEach(() => {
    getServerSession.mockReset();
    userFindUnique.mockReset();
    inspectionFindFirst.mockReset();
    inspectionUpdate.mockReset();
    usageEventCreate.mockReset();
    safeRetrieveSimilarJobs.mockReset();
    resolveWorkspaceAiKey.mockReset();
    generateScopeStream.mockReset();
    scopeItemCreateMany.mockReset();
    scopeItemDeleteMany.mockReset();

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
    inspectionUpdate.mockResolvedValue({});
    usageEventCreate.mockResolvedValue({});
    scopeItemCreateMany.mockResolvedValue({ count: 1 });
    scopeItemDeleteMany.mockResolvedValue({ count: 0 });
    safeRetrieveSimilarJobs.mockResolvedValue({ jobCount: 0, contextPrompt: "" });
    resolveWorkspaceAiKey.mockResolvedValue({
      workspaceId: "ws_1",
      apiKey: "sk-ant-workspace",
    });
  });

  it("stores determineScopeItems clauseRefs[0] and leaves justification unchanged", async () => {
    const expectedClauseRef = expectedExtractClauseRef();
    generateScopeStream.mockResolvedValueOnce({
      ok: true,
      data: streamMarkdown(markdownWithoutInlineCitation()),
    });

    const response = await POST(postRequest(), {
      params: Promise.resolve({ id: "inspection_1" }),
    });
    expect(response.status).toBe(200);
    await response.text();

    expect(scopeItemCreateMany).toHaveBeenCalled();
    const items = createdScopeItems();
    const extract = items.find(
      (item) => item.itemType === "extract_standing_water",
    );
    expect(extract).toBeDefined();
    expect(extract?.clauseRef).toBe(expectedClauseRef);
    expect(extract?.justification).toBe("AI-generated per IICRC S500:2021");
  });
});
