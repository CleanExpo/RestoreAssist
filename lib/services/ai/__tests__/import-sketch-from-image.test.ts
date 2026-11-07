import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/ai/anthropic-gateway", () => ({
  callAnthropic: vi.fn(),
}));

import { importSketchFromImage } from "../import-sketch-from-image";
import { callAnthropic } from "@/lib/services/ai/anthropic-gateway";

const sampleArgs = {
  apiKey: "sk-platform",
  base64Image: "iVBORw0KGgo",
  mediaType: "image/jpeg" as const,
};

describe("importSketchFromImage", () => {
  beforeEach(() => {
    vi.mocked(callAnthropic).mockReset();
  });

  it("returns ok with parsed rooms + usage on success", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_1",
        usage: { input_tokens: 1500, output_tokens: 200 },
        content: [
          {
            type: "text",
            text: JSON.stringify({
              rooms: [
                {
                  label: "Living Room",
                  vertices: [
                    { x: 0.1, y: 0.1 },
                    { x: 0.5, y: 0.1 },
                    { x: 0.5, y: 0.5 },
                    { x: 0.1, y: 0.5 },
                  ],
                },
              ],
            }),
          },
        ],
      } as never,
    });

    const r = await importSketchFromImage(sampleArgs);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.rooms).toHaveLength(1);
      expect(r.data.rooms[0].label).toBe("Living Room");
      expect(r.data.usage).toEqual({ inputTokens: 1500, outputTokens: 200 });
    }
  });

  it("propagates gateway MODEL_OVERLOADED reason", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: false,
      reason: "MODEL_OVERLOADED",
      detail: "529",
      retryAfterMs: 10000,
    });
    const r = await importSketchFromImage(sampleArgs);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("MODEL_OVERLOADED");
      expect(r.retryAfterMs).toBe(10000);
    }
  });

  it("tolerates markdown fences around JSON", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_2",
        usage: { input_tokens: 1000, output_tokens: 100 },
        content: [
          {
            type: "text",
            text:
              "```json\n" +
              JSON.stringify({
                rooms: [
                  {
                    label: "Kitchen",
                    vertices: [
                      { x: 0.0, y: 0.0 },
                      { x: 0.3, y: 0.0 },
                      { x: 0.3, y: 0.3 },
                    ],
                  },
                ],
              }) +
              "\n```",
          },
        ],
      } as never,
    });
    const r = await importSketchFromImage(sampleArgs);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.rooms[0].label).toBe("Kitchen");
  });

  it("returns PARSE_FAILED on non-JSON output", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_3",
        usage: { input_tokens: 100, output_tokens: 20 },
        content: [{ type: "text", text: "I cannot extract rooms from this." }],
      } as never,
    });
    const r = await importSketchFromImage(sampleArgs);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("PARSE_FAILED");
      expect(r.detail).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// RA-8235 part A: strict validation applies to the output of BOTH readers.
// ---------------------------------------------------------------------------
describe("importSketchFromImage output validation (RA-8235)", () => {
  const goodRoom = {
    label: "Bed 1",
    vertices: [
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.1 },
      { x: 0.5, y: 0.5 },
      { x: 0.1, y: 0.5 },
    ],
  };
  const bowTie = {
    label: "Twisted",
    vertices: [
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.1 },
      { x: 0.1, y: 0.5 },
    ],
  };
  const msg = (payload: unknown, input = 100, output = 20) => ({
    ok: true as const,
    data: {
      id: "m",
      usage: { input_tokens: input, output_tokens: output },
      content: [{ type: "text", text: JSON.stringify(payload) }],
    } as never,
  });

  beforeEach(() => {
    vi.mocked(callAnthropic).mockReset();
  });

  it("tags rooms ai_suggested, strips billing fields, outcome is ok", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce(
      msg({ rooms: [{ ...goodRoom, areaM2: 40, confirmed: true }] }),
    );
    const r = await importSketchFromImage(sampleArgs);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.outcome.status).toBe("ok");
    expect(r.data.rooms).toHaveLength(1);
    expect(r.data.rooms[0]).toEqual({
      label: "Bed 1",
      vertices: goodRoom.vertices,
      provenance: "ai_suggested",
    });
    expect(r.data.usage).toEqual({ inputTokens: 100, outputTokens: 20 });
  });

  it("drops only the bad room and says how many and why", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce(
      msg({ rooms: [goodRoom, bowTie] }),
    );
    const r = await importSketchFromImage(sampleArgs);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.rooms.map((x) => x.label)).toEqual(["Bed 1"]);
    expect(r.data.outcome.droppedCount).toBe(1);
    expect(r.data.outcome.dropped[0].reason).toMatch(/cross/i);
    expect(r.data.outcome.message).toMatch(/1 room/);
  });

  it("non-array rooms: whole result is invalid with manual-drawing fallback, usage kept, no throw", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce(
      msg({ rooms: "kitchen" }, 700, 50),
    );
    const r = await importSketchFromImage(sampleArgs);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.rooms).toEqual([]);
    expect(r.data.outcome.status).toBe("invalid");
    expect(r.data.outcome.manualDrawingFallback).toBe(true);
    expect(r.data.usage).toEqual({ inputTokens: 700, outputTokens: 50 });
  });

  it("empty rooms: no_plan outcome with manual-drawing fallback", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce(msg({ rooms: [] }));
    const r = await importSketchFromImage(sampleArgs);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.outcome.status).toBe("no_plan");
    expect(r.data.outcome.manualDrawingFallback).toBe(true);
    expect(r.data.rooms).toEqual([]);
  });

  it("JSON null stays PARSE_FAILED (backup trigger unchanged)", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: true as const,
      data: { id: "m", content: [{ type: "text", text: "null" }] } as never,
    });
    const r = await importSketchFromImage(sampleArgs);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("PARSE_FAILED");
  });

  it("BACKUP reader output is validated the same way", async () => {
    vi.mocked(callAnthropic)
      .mockResolvedValueOnce({
        ok: false as const,
        reason: "API_ERROR" as never,
        detail: "boom",
      })
      .mockResolvedValueOnce(msg({ rooms: [goodRoom, bowTie] }));
    const r = await importSketchFromImage({
      ...sampleArgs,
      fallback: { apiKey: "ak-platform" },
    });
    expect(callAnthropic).toHaveBeenCalledTimes(2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.reader.vendor).toBe("abliteration");
    expect(r.data.primaryFailure?.reason).toBe("API_ERROR");
    expect(r.data.rooms.map((x) => x.label)).toEqual(["Bed 1"]);
    expect(r.data.rooms[0].provenance).toBe("ai_suggested");
    expect(r.data.outcome.droppedCount).toBe(1);
  });

  it("an invalid PRIMARY result does not trigger the backup (#2510 trigger unchanged)", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce(msg({ rooms: [bowTie] }));
    const r = await importSketchFromImage({
      ...sampleArgs,
      fallback: { apiKey: "ak-platform" },
    });
    expect(callAnthropic).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.outcome.status).toBe("invalid");
      expect(r.data.reader.vendor).toBe("anthropic");
    }
  });
});
