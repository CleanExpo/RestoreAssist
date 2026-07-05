/**
 * Rule 5 regression — the similar-jobs search must reject CANCELED /
 * PAST_DUE users with 402 before the paid OpenAI embedding call.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.hoisted(() => vi.fn());
const userFindUnique = vi.hoisted(() => vi.fn());
const inspectionFindUnique = vi.hoisted(() => vi.fn());
const assertInspectionTenancy = vi.hoisted(() => vi.fn());
const embedText = vi.hoisted(() => vi.fn());
const findSimilarJobs = vi.hoisted(() => vi.fn());
const resolveWorkspaceAiKey = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    inspection: { findUnique: (...a: unknown[]) => inspectionFindUnique(...a) },
  },
}));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: (...a: unknown[]) => assertInspectionTenancy(...a),
}));
vi.mock("@/lib/ai/embeddings", () => ({
  embedText: (...a: unknown[]) => embedText(...a),
  buildJobEmbeddingText: () => "query text",
  findSimilarJobs: (...a: unknown[]) => findSimilarJobs(...a),
}));
vi.mock("@/lib/ai/resolve-workspace-ai-key", () => ({
  resolveWorkspaceAiKey: (...a: unknown[]) => resolveWorkspaceAiKey(...a),
  NoWorkspaceKeyError: class NoWorkspaceKeyError extends Error {},
}));

import { GET } from "../route";
import { NoWorkspaceKeyError } from "@/lib/ai/resolve-workspace-ai-key";

function makeRequest() {
  return new NextRequest(
    "http://localhost/api/inspections/insp_1/similar-jobs?limit=5",
  );
}
const ctx = { params: Promise.resolve({ id: "insp_1" }) };

beforeEach(() => {
  getServerSession.mockReset();
  userFindUnique.mockReset();
  inspectionFindUnique.mockReset();
  assertInspectionTenancy.mockReset();
  embedText.mockReset();
  findSimilarJobs.mockReset();
  resolveWorkspaceAiKey.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  userFindUnique.mockResolvedValue({ subscriptionStatus: "ACTIVE" });
  assertInspectionTenancy.mockResolvedValue({ ok: true });
  inspectionFindUnique.mockResolvedValue({
    classifications: [],
    affectedAreas: [],
    propertyAddress: null,
    inspectionNumber: "INSP-1",
  });
  resolveWorkspaceAiKey.mockRejectedValue(new NoWorkspaceKeyError("OPENAI"));
  embedText.mockResolvedValue([0, 0, 0]);
  findSimilarJobs.mockResolvedValue([]);
});

describe("GET /api/inspections/[id]/similar-jobs — Rule 5 subscription gate", () => {
  it.each(["CANCELED", "PAST_DUE"])(
    "returns 402 with no embedding call for %s subscriptions",
    async (status) => {
      userFindUnique.mockResolvedValueOnce({ subscriptionStatus: status });

      const res = await GET(makeRequest(), ctx);
      const body = await res.json();

      expect(res.status).toBe(402);
      expect(body.upgradeRequired).toBe(true);
      expect(embedText).not.toHaveBeenCalled();
      expect(inspectionFindUnique).not.toHaveBeenCalled();
    },
  );

  it("lets active subscriptions reach the embedding call", async () => {
    const res = await GET(makeRequest(), ctx);

    expect(res.status).toBe(200);
    expect(embedText).toHaveBeenCalledTimes(1);
  });
});
