import { describe, it, expect, vi } from "vitest";
import { transcribeToCues } from "../transcribe";

describe("transcribeToCues", () => {
  it("maps whisper segments to caption cues in ms", async () => {
    const client = {
      audio: {
        transcriptions: {
          create: vi.fn(async () => ({
            segments: [
              { start: 0, end: 1.5, text: "Hi there" },
              { start: 1.5, end: 3.04, text: "great job" },
            ],
          })),
        },
      },
    };
    const cues = await transcribeToCues(Buffer.from("x"), {
      client: client as never,
      filename: "clip.webm",
    });
    expect(cues).toEqual([
      { startMs: 0, endMs: 1500, text: "Hi there" },
      { startMs: 1500, endMs: 3040, text: "great job" },
    ]);
  });

  it("returns [] when whisper yields no segments", async () => {
    const client = {
      audio: {
        transcriptions: {
          create: vi.fn(async () => ({ segments: undefined })),
        },
      },
    };
    const cues = await transcribeToCues(Buffer.from("x"), {
      client: client as never,
      filename: "clip.webm",
    });
    expect(cues).toEqual([]);
  });

  it("trims whitespace from segment text", async () => {
    const client = {
      audio: {
        transcriptions: {
          create: vi.fn(async () => ({
            segments: [{ start: 0, end: 1, text: "  spaced  " }],
          })),
        },
      },
    };
    const cues = await transcribeToCues(Buffer.from("x"), {
      client: client as never,
      filename: "clip.webm",
    });
    expect(cues[0].text).toBe("spaced");
  });
});
