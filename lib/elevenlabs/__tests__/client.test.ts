/**
 * RA-6920 / RA-6998 — the ElevenLabs client spends the INJECTED workspace key
 * and never reads a platform process.env.ELEVENLABS_API_KEY. It fails closed
 * when no key is supplied.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateSFX, textToSpeech } from "../client";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({
    ok: true,
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  });
  // Prove independence from any platform env key: even if one is set, the
  // client must use the injected key.
  vi.stubEnv("ELEVENLABS_API_KEY", "sk-PLATFORM-must-not-be-used");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("generateSFX", () => {
  it("sends the injected workspace key in the xi-api-key header", async () => {
    await generateSFX({ text: "rain" }, "sk-eleven-workspace");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe(
      "sk-eleven-workspace",
    );
    // The platform env key is never used.
    expect((init.headers as Record<string, string>)["xi-api-key"]).not.toBe(
      "sk-PLATFORM-must-not-be-used",
    );
  });

  it("fails closed when no key is supplied", async () => {
    await expect(generateSFX({ text: "rain" }, "")).rejects.toThrow(
      /API key is required/i,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("textToSpeech", () => {
  it("uses the workspace default Voice ID when the request omits voice_id", async () => {
    await textToSpeech(
      { text: "hello" },
      { apiKey: "sk-eleven-workspace", voiceId: "voice-abc" },
    );

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/text-to-speech/voice-abc/");
  });

  it("fails closed when neither request nor workspace supplies a Voice ID", async () => {
    await expect(
      textToSpeech({ text: "hello" }, { apiKey: "sk-eleven-workspace" }),
    ).rejects.toThrow(/Voice ID/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
