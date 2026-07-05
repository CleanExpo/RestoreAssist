/**
 * Rule 5 regression — the Whisper transcription route must reject
 * CANCELED / PAST_DUE users with 402 before any paid AI spend.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.hoisted(() => vi.fn());
const applyRateLimit = vi.hoisted(() => vi.fn());
const userFindUnique = vi.hoisted(() => vi.fn());
const resolveWorkspaceAiKey = vi.hoisted(() => vi.fn());
const transcriptionsCreate = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...a: unknown[]) => applyRateLimit(...a),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: (...a: unknown[]) => userFindUnique(...a) } },
}));
vi.mock("@/lib/ai/resolve-workspace-ai-key", () => ({
  resolveWorkspaceAiKey: (...a: unknown[]) => resolveWorkspaceAiKey(...a),
  NoWorkspaceKeyError: class NoWorkspaceKeyError extends Error {},
}));
vi.mock("openai", () => ({
  default: class OpenAI {
    audio = {
      transcriptions: { create: (...a: unknown[]) => transcriptionsCreate(...a) },
    };
  },
}));

import { POST } from "../route";

function makeRequest() {
  return new NextRequest("http://localhost/api/ai/voice-note-transcribe", {
    method: "POST",
  });
}

beforeEach(() => {
  getServerSession.mockReset();
  applyRateLimit.mockReset();
  userFindUnique.mockReset();
  resolveWorkspaceAiKey.mockReset();
  transcriptionsCreate.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user-1" } });
  applyRateLimit.mockResolvedValue(null);
  userFindUnique.mockResolvedValue({ subscriptionStatus: "ACTIVE" });
  resolveWorkspaceAiKey.mockResolvedValue({ apiKey: "openai-key" });
});

describe("POST /api/ai/voice-note-transcribe — Rule 5 subscription gate", () => {
  it.each(["CANCELED", "PAST_DUE"])(
    "returns 402 with no AI spend for %s subscriptions",
    async (status) => {
      userFindUnique.mockResolvedValueOnce({ subscriptionStatus: status });

      const res = await POST(makeRequest());
      const body = await res.json();

      expect(res.status).toBe(402);
      expect(body.upgradeRequired).toBe(true);
      // Gate short-circuits before rate-limit spend, key resolution and Whisper.
      expect(applyRateLimit).not.toHaveBeenCalled();
      expect(resolveWorkspaceAiKey).not.toHaveBeenCalled();
      expect(transcriptionsCreate).not.toHaveBeenCalled();
    },
  );

  it.each(["TRIAL", "ACTIVE", "LIFETIME"])(
    "lets %s subscriptions past the gate",
    async (status) => {
      userFindUnique.mockResolvedValueOnce({ subscriptionStatus: status });

      const res = await POST(makeRequest());

      // Missing multipart body → 400 AFTER the gate passes, proving the
      // subscription check let this status through to the workspace-key step.
      expect(res.status).not.toBe(402);
      expect(applyRateLimit).toHaveBeenCalledTimes(1);
      expect(resolveWorkspaceAiKey).toHaveBeenCalledTimes(1);
    },
  );
});
