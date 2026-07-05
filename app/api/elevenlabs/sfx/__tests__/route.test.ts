/**
 * RA-6920 / RA-6998 — the SFX route must run on the calling workspace's own
 * ElevenLabs key (BYOK), never the platform key. It fails closed with a 402
 * when the workspace has no key, and threads the resolved key into generateSFX.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.hoisted(() => vi.fn());
const applyRateLimit = vi.hoisted(() => vi.fn());
const requireActiveSubscription = vi.hoisted(() => vi.fn());
const generateSFX = vi.hoisted(() => vi.fn());
const resolveWorkspaceElevenLabsKey = vi.hoisted(() => vi.fn());

const { NoWorkspaceKeyError } = vi.hoisted(() => {
  class NoWorkspaceKeyError extends Error {
    constructor() {
      super("no workspace key");
      this.name = "NoWorkspaceKeyError";
    }
  }
  return { NoWorkspaceKeyError };
});

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...a: unknown[]) => applyRateLimit(...a),
}));
vi.mock("@/lib/billing/subscription-gate", () => ({
  requireActiveSubscription: (...a: unknown[]) => requireActiveSubscription(...a),
}));
vi.mock("@/lib/elevenlabs/client", () => ({
  generateSFX: (...a: unknown[]) => generateSFX(...a),
}));
vi.mock("@/lib/ai/resolve-workspace-ai-key", () => ({
  resolveWorkspaceElevenLabsKey: (...a: unknown[]) =>
    resolveWorkspaceElevenLabsKey(...a),
  NoWorkspaceKeyError,
}));

import { POST as sfxPost } from "../route";

function makeReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/elevenlabs/sfx", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "user-1" } });
  applyRateLimit.mockResolvedValue(null);
  requireActiveSubscription.mockResolvedValue(null);
});

describe("POST /api/elevenlabs/sfx — workspace BYOK (RA-6920)", () => {
  it("fails closed with 402 when the workspace has no ElevenLabs key", async () => {
    resolveWorkspaceElevenLabsKey.mockRejectedValue(new NoWorkspaceKeyError());

    const res = await sfxPost(makeReq({ description: "rain on a tin roof" }));

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.upgradeRequired).toBe(true);
    expect(body.error).toMatch(/ElevenLabs API key/i);
    // No platform spend — the client must never be called without a key.
    expect(generateSFX).not.toHaveBeenCalled();
  });

  it("threads the resolved workspace key into generateSFX and returns audio", async () => {
    resolveWorkspaceElevenLabsKey.mockResolvedValue({
      workspaceId: "ws-1",
      apiKey: "sk-eleven-workspace",
    });
    generateSFX.mockResolvedValue(Buffer.from("audio-bytes"));

    const res = await sfxPost(makeReq({ description: "gentle whoosh" }));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(generateSFX).toHaveBeenCalledTimes(1);
    // Second argument is the workspace-owned key, not a platform env key.
    expect(generateSFX.mock.calls[0][1]).toBe("sk-eleven-workspace");
    expect(generateSFX.mock.calls[0][0]).toEqual(
      expect.objectContaining({ text: "gentle whoosh" }),
    );
  });

  it("resolves the workspace key only after the subscription gate", async () => {
    requireActiveSubscription.mockResolvedValue(
      new Response(JSON.stringify({ error: "Active subscription required" }), {
        status: 402,
      }),
    );

    const res = await sfxPost(makeReq({ description: "rain" }));

    expect(res.status).toBe(402);
    expect(resolveWorkspaceElevenLabsKey).not.toHaveBeenCalled();
    expect(generateSFX).not.toHaveBeenCalled();
  });
});
