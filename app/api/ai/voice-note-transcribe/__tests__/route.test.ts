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
      transcriptions: {
        create: (...a: unknown[]) => transcriptionsCreate(...a),
      },
    };
  },
}));

import { POST } from "../route";

function makeRequest() {
  return new NextRequest("http://localhost/api/ai/voice-note-transcribe", {
    method: "POST",
  });
}

function makeMultipartRequest(formData: FormData) {
  return new NextRequest("http://localhost/api/ai/voice-note-transcribe", {
    method: "POST",
    body: formData,
  });
}

function webmFile(
  name = "note.webm",
  type = "audio/webm",
  bytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81]),
) {
  return new File([bytes], name, { type });
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

  it.each(["TRIAL", "ACTIVE"])(
    "lets %s subscriptions past the gate",
    async (status) => {
      userFindUnique.mockResolvedValueOnce({
        subscriptionStatus: status,
        lifetimeAccess: false,
      });

      const res = await POST(makeRequest());

      // Missing multipart body → 400 AFTER the subscription and rate-limit
      // gates pass, but before any workspace key or provider access.
      expect(res.status).not.toBe(402);
      expect(applyRateLimit).toHaveBeenCalledTimes(1);
      expect(resolveWorkspaceAiKey).not.toHaveBeenCalled();
    },
  );

  // Previously asserted via `subscriptionStatus: "LIFETIME"` — a value the
  // SubscriptionStatus enum cannot produce, so the test passed against a row
  // that can never exist. A real lifetime buyer carries lifetimeAccess=true
  // with a CANCELED/null status, and was being refused here.
  it("lets a real lifetime customer past the gate", async () => {
    userFindUnique.mockResolvedValueOnce({
      subscriptionStatus: "CANCELED",
      lifetimeAccess: true,
    });

    const res = await POST(makeRequest());

    expect(res.status).not.toBe(402);
    expect(applyRateLimit).toHaveBeenCalledTimes(1);
    expect(resolveWorkspaceAiKey).not.toHaveBeenCalled();
  });
});

describe("POST /api/ai/voice-note-transcribe — upload validation", () => {
  it("accepts valid WebM bytes and normalises provider metadata", async () => {
    transcriptionsCreate.mockResolvedValue({
      text: "Moisture reading",
      duration: 2,
    });
    const formData = new FormData();
    formData.set("audio", webmFile("spoofed.txt", "text/plain"));

    const response = await POST(makeMultipartRequest(formData));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.transcript).toBe("Moisture reading");
    expect(resolveWorkspaceAiKey).toHaveBeenCalledTimes(1);
    expect(transcriptionsCreate).toHaveBeenCalledTimes(1);
    const providerFile = transcriptionsCreate.mock.calls[0][0].file as File;
    expect(providerFile.name).toBe("voice-note.webm");
    expect(providerFile.type).toBe("audio/webm");
  });

  it.each([
    [
      "WAV",
      new Uint8Array([
        0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45,
      ]),
      "wav",
      "audio/wav",
    ],
    [
      "Ogg",
      new Uint8Array([
        0x4f, 0x67, 0x67, 0x53, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0,
      ]),
      "ogg",
      "audio/ogg",
    ],
    [
      "MP3",
      new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]),
      "mp3",
      "audio/mpeg",
    ],
    [
      "M4A",
      new Uint8Array([
        0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20,
      ]),
      "m4a",
      "audio/mp4",
    ],
    [
      "MP4",
      new Uint8Array([
        0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
      ]),
      "mp4",
      "audio/mp4",
    ],
  ])("preserves valid %s uploads", async (_label, bytes, extension, type) => {
    transcriptionsCreate.mockResolvedValue({ text: "Valid audio" });
    const formData = new FormData();
    formData.set(
      "audio",
      new File([bytes], "recording.bin", {
        type: "application/octet-stream",
      }),
    );

    const response = await POST(makeMultipartRequest(formData));

    expect(response.status).toBe(200);
    const providerFile = transcriptionsCreate.mock.calls[0][0].file as File;
    expect(providerFile.name).toBe(`voice-note.${extension}`);
    expect(providerFile.type).toBe(type);
  });

  it("rejects spoofed audio before key resolution or provider access", async () => {
    const formData = new FormData();
    formData.set(
      "audio",
      new File(["not audio"], "spoofed.webm", { type: "audio/webm" }),
    );

    const response = await POST(makeMultipartRequest(formData));

    expect(response.status).toBe(415);
    expect(resolveWorkspaceAiKey).not.toHaveBeenCalled();
    expect(transcriptionsCreate).not.toHaveBeenCalled();
  });

  it("rejects truncated audio before key resolution or provider access", async () => {
    const formData = new FormData();
    formData.set(
      "audio",
      new File([new Uint8Array([0x1a, 0x45])], "short.webm", {
        type: "audio/webm",
      }),
    );

    const response = await POST(makeMultipartRequest(formData));

    expect(response.status).toBe(415);
    expect(resolveWorkspaceAiKey).not.toHaveBeenCalled();
    expect(transcriptionsCreate).not.toHaveBeenCalled();
  });

  it("rejects declared oversize audio before buffering", async () => {
    const formData = new FormData();
    const audio = webmFile();
    Object.defineProperty(audio, "size", { value: 10 * 1024 * 1024 + 1 });
    const arrayBuffer = vi.spyOn(audio, "arrayBuffer");
    formData.set("audio", audio);
    const request = makeRequest();
    vi.spyOn(request, "formData").mockResolvedValue(formData);

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(resolveWorkspaceAiKey).not.toHaveBeenCalled();
    expect(transcriptionsCreate).not.toHaveBeenCalled();
  });

  it("rejects excess audio files before buffering", async () => {
    const first = webmFile("first.webm");
    const second = webmFile("second.webm");
    const firstArrayBuffer = vi.spyOn(first, "arrayBuffer");
    const secondArrayBuffer = vi.spyOn(second, "arrayBuffer");
    const formData = new FormData();
    formData.append("audio", first);
    formData.append("audio", second);
    const request = makeRequest();
    vi.spyOn(request, "formData").mockResolvedValue(formData);

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(firstArrayBuffer).not.toHaveBeenCalled();
    expect(secondArrayBuffer).not.toHaveBeenCalled();
    expect(resolveWorkspaceAiKey).not.toHaveBeenCalled();
    expect(transcriptionsCreate).not.toHaveBeenCalled();
  });
});
