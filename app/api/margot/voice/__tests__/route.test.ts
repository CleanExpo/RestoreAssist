/**
 * RA-6998 Part B — Margot's optional voice route synthesises with the calling
 * workspace's OWN ElevenLabs key AND its configured Voice ID (from #1801's
 * { apiKey, voiceId } blob), never the platform key and never the brand default
 * voice. It fails closed to a text-only signal when the key or Voice ID is
 * absent.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const getServerSession = vi.hoisted(() => vi.fn());
const verifyAdminFromDb = vi.hoisted(() => vi.fn());
const textToSpeech = vi.hoisted(() => vi.fn());
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
vi.mock("@/lib/admin-auth", () => ({
  verifyAdminFromDb: (...a: unknown[]) => verifyAdminFromDb(...a),
}));
vi.mock("@/lib/elevenlabs/client", () => ({
  textToSpeech: (...a: unknown[]) => textToSpeech(...a),
}));
vi.mock("@/lib/ai/resolve-workspace-ai-key", () => ({
  resolveWorkspaceElevenLabsKey: (...a: unknown[]) =>
    resolveWorkspaceElevenLabsKey(...a),
  NoWorkspaceKeyError,
}));
vi.mock("@/lib/api-errors", () => ({
  apiError: (_req: unknown, opts: { status: number; message: string }) =>
    NextResponse.json({ error: opts.message }, { status: opts.status }),
  fromException: () =>
    NextResponse.json({ error: "Internal server error" }, { status: 500 }),
}));

import { POST as voicePost } from "../route";

function makeReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/margot/voice", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "user-1" } });
  verifyAdminFromDb.mockResolvedValue({ user: { id: "user-1" } });
});

describe("POST /api/margot/voice — workspace Voice ID (RA-6998)", () => {
  it("returns 403/redirect from the admin gate before any synthesis", async () => {
    verifyAdminFromDb.mockResolvedValue({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const res = await voicePost(makeReq({ text: "hello" }));

    expect(res.status).toBe(403);
    expect(resolveWorkspaceElevenLabsKey).not.toHaveBeenCalled();
    expect(textToSpeech).not.toHaveBeenCalled();
  });

  it("rejects an empty text body with 400", async () => {
    const res = await voicePost(makeReq({ text: "   " }));
    expect(res.status).toBe(400);
    expect(resolveWorkspaceElevenLabsKey).not.toHaveBeenCalled();
  });

  it("fails closed to a text-only 402 when the workspace has no ElevenLabs key", async () => {
    resolveWorkspaceElevenLabsKey.mockRejectedValue(new NoWorkspaceKeyError());

    const res = await voicePost(makeReq({ text: "hello" }));

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.voiceUnavailable).toBe(true);
    expect(textToSpeech).not.toHaveBeenCalled();
  });

  it("fails closed to a text-only 422 when no Voice ID is configured (never the brand default)", async () => {
    resolveWorkspaceElevenLabsKey.mockResolvedValue({
      workspaceId: "ws-1",
      apiKey: "sk-eleven-workspace",
      voiceId: undefined,
    });

    const res = await voicePost(makeReq({ text: "hello" }));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.voiceUnavailable).toBe(true);
    expect(textToSpeech).not.toHaveBeenCalled();
  });

  it("synthesises with the workspace key AND the stored Voice ID", async () => {
    resolveWorkspaceElevenLabsKey.mockResolvedValue({
      workspaceId: "ws-1",
      apiKey: "sk-eleven-workspace",
      voiceId: "workspace-voice-123",
    });
    textToSpeech.mockResolvedValue(Buffer.from("audio-bytes"));

    const res = await voicePost(makeReq({ text: "hello Phill" }));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(textToSpeech).toHaveBeenCalledTimes(1);
    // credentials carry the WORKSPACE key + the WORKSPACE Voice ID, not defaults.
    expect(textToSpeech.mock.calls[0][0]).toEqual(
      expect.objectContaining({ text: "hello Phill" }),
    );
    expect(textToSpeech.mock.calls[0][1]).toEqual({
      apiKey: "sk-eleven-workspace",
      voiceId: "workspace-voice-123",
    });
  });
});
