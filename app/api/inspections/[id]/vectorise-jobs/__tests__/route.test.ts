/**
 * Rule 5 regression — the embedding worker must reject CANCELED /
 * PAST_DUE users with 402 before the paid OpenAI embedding loop.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.hoisted(() => vi.fn());
const userFindUnique = vi.hoisted(() => vi.fn());
const queryRaw = vi.hoisted(() => vi.fn());
const executeRaw = vi.hoisted(() => vi.fn());
const embedText = vi.hoisted(() => vi.fn());
const resolveWorkspaceAiKey = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    $queryRaw: (...a: unknown[]) => queryRaw(...a),
    $executeRaw: (...a: unknown[]) => executeRaw(...a),
  },
}));
vi.mock("@/lib/ai/embeddings", () => ({
  embedText: (...a: unknown[]) => embedText(...a),
  buildJobEmbeddingText: () => "job text",
}));
vi.mock("@/lib/ai/resolve-workspace-ai-key", () => ({
  resolveWorkspaceAiKey: (...a: unknown[]) => resolveWorkspaceAiKey(...a),
  NoWorkspaceKeyError: class NoWorkspaceKeyError extends Error {},
}));

import { POST } from "../route";
import { NoWorkspaceKeyError } from "@/lib/ai/resolve-workspace-ai-key";

function makeRequest(body: Record<string, unknown> = {}) {
  return new NextRequest(
    "http://localhost/api/inspections/insp_1/vectorise-jobs",
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    },
  );
}
const ctx = { params: Promise.resolve({ id: "insp_1" }) };

beforeEach(() => {
  getServerSession.mockReset();
  userFindUnique.mockReset();
  queryRaw.mockReset();
  executeRaw.mockReset();
  embedText.mockReset();
  resolveWorkspaceAiKey.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  userFindUnique.mockResolvedValue({ subscriptionStatus: "ACTIVE" });
  resolveWorkspaceAiKey.mockRejectedValue(new NoWorkspaceKeyError("OPENAI"));
  // Count query → 0 rows, then the un-embedded fetch → empty: the route
  // short-circuits with "nothing to do" after passing the gate.
  queryRaw
    .mockResolvedValueOnce([{ count: 0n }])
    .mockResolvedValueOnce([]);
});

describe("POST /api/inspections/[id]/vectorise-jobs — Rule 5 subscription gate", () => {
  it.each(["CANCELED", "PAST_DUE"])(
    "returns 402 with no embedding call for %s subscriptions",
    async (status) => {
      userFindUnique.mockResolvedValueOnce({ subscriptionStatus: status });

      const res = await POST(makeRequest(), ctx);
      const body = await res.json();

      expect(res.status).toBe(402);
      expect(body.upgradeRequired).toBe(true);
      expect(queryRaw).not.toHaveBeenCalled();
      expect(embedText).not.toHaveBeenCalled();
    },
  );

  it("lets active subscriptions past the gate", async () => {
    const res = await POST(makeRequest(), ctx);

    expect(res.status).not.toBe(402);
    expect(queryRaw).toHaveBeenCalled();
  });
});
