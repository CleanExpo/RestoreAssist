import { describe, it, expect } from "vitest";
import {
  parseTurnFrames,
  streamTurn,
  summariseToolCall,
  toolCallGaps,
  type TurnEvent,
} from "../turn-stream";

describe("parseTurnFrames", () => {
  it("decodes a token then done frame, stripping the data: prefix", () => {
    const buf =
      `data: ${JSON.stringify({ type: "token", content: "Cat 2 water." })}\n\n` +
      `data: ${JSON.stringify({ type: "done", utteranceId: "u1", clauseRefs: ["S500:2021 §10.5"], confidence: 0.83 })}\n\n`;
    const { events, rest } = parseTurnFrames(buf);
    expect(rest).toBe("");
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: "token", content: "Cat 2 water." });
    expect(events[1]).toMatchObject({ type: "done", utteranceId: "u1", confidence: 0.83 });
  });

  it("carries an incomplete trailing frame forward as rest", () => {
    const buf = `data: ${JSON.stringify({ type: "token", content: "x" })}\n\ndata: {"type":"do`;
    const { events, rest } = parseTurnFrames(buf);
    expect(events).toHaveLength(1);
    expect(rest).toContain('"type":"do');
  });

  it("ignores malformed frames without throwing", () => {
    const buf = `data: not-json\n\ndata: ${JSON.stringify({ type: "error", message: "boom" })}\n\n`;
    const { events } = parseTurnFrames(buf);
    expect(events).toEqual([{ type: "error", message: "boom" }]);
  });
});

function responseFromChunks(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader() {
        return {
          read: async () =>
            i < chunks.length
              ? { done: false, value: encoder.encode(chunks[i++]) }
              : { done: true, value: undefined },
        };
      },
    },
  } as unknown as Response;
}

describe("streamTurn", () => {
  it("emits events across arbitrarily-split chunks", async () => {
    const res = responseFromChunks([
      `data: ${JSON.stringify({ type: "token", content: "Hello" })}\n`,
      `\ndata: ${JSON.stringify({ type: "done", utteranceId: "u1", clauseRefs: [], confidence: 0.8 })}\n\n`,
    ]);
    const got: TurnEvent[] = [];
    await streamTurn(res, (e) => got.push(e));
    expect(got.map((e) => e.type)).toEqual(["token", "done"]);
  });

  it("throws when the body is not streamable", async () => {
    await expect(
      streamTurn({ ok: true, status: 200, body: null } as unknown as Response, () => {}),
    ).rejects.toThrow(/not supported/i);
  });
});

describe("tool_call events (RA-1132i-2)", () => {
  it("parses a tool_call frame ahead of the token/done frames", () => {
    const buf =
      `data: ${JSON.stringify({ type: "tool_call", id: "tc1", toolName: "take_reading", ok: true, result: { location: "Bathroom", value: 45, unit: "PERCENT_MC" } })}\n\n` +
      `data: ${JSON.stringify({ type: "token", content: "Logged it." })}\n\n` +
      `data: ${JSON.stringify({ type: "done", utteranceId: "u1", clauseRefs: [], confidence: 0.8 })}\n\n`;
    const { events } = parseTurnFrames(buf);
    expect(events.map((e) => e.type)).toEqual(["tool_call", "token", "done"]);
    const tc = events[0] as Extract<TurnEvent, { type: "tool_call" }>;
    expect(tc).toMatchObject({ toolName: "take_reading", ok: true });
  });
});

describe("summariseToolCall", () => {
  it("summarises a take_reading result", () => {
    expect(
      summariseToolCall({
        id: "tc1",
        toolName: "take_reading",
        ok: true,
        result: { location: "Bathroom", value: 45, unit: "PERCENT_MC" },
      }),
    ).toBe("Logged reading — Bathroom: 45 PERCENT_MC");
  });

  it("degrades gracefully when the result shape is unexpected", () => {
    expect(
      summariseToolCall({ id: "tc1", toolName: "take_reading", ok: true, result: null }),
    ).toBe("Logged reading — reading");
  });

  it("humanises an unknown tool name", () => {
    expect(
      summariseToolCall({ id: "tc2", toolName: "capture_photo", ok: true }),
    ).toBe("Capture photo");
  });

  it("summarises check_report_gaps by gap count", () => {
    expect(
      summariseToolCall({
        id: "g1",
        toolName: "check_report_gaps",
        ok: true,
        result: { gaps: [] },
      }),
    ).toBe("Report check — looks complete");
    expect(
      summariseToolCall({
        id: "g2",
        toolName: "check_report_gaps",
        ok: true,
        result: {
          gaps: [
            { field: "photos", severity: "warn", description: "No photos" },
            { field: "class", severity: "block", description: "No class" },
          ],
        },
      }),
    ).toBe("Report check — 2 gaps to address");
  });
});

describe("toolCallGaps", () => {
  it("extracts and normalises gaps from a check_report_gaps result", () => {
    const gaps = toolCallGaps({
      id: "g1",
      toolName: "check_report_gaps",
      ok: true,
      result: {
        gaps: [
          { field: "photos", severity: "warn", description: "No photos captured" },
          { field: "class", severity: "block", description: "No classification" },
        ],
      },
    });
    expect(gaps).toEqual([
      { field: "photos", severity: "warn", description: "No photos captured" },
      { field: "class", severity: "block", description: "No classification" },
    ]);
  });

  it("returns [] for other tools or a malformed payload", () => {
    expect(
      toolCallGaps({ id: "r1", toolName: "take_reading", ok: true, result: { gaps: [] } }),
    ).toEqual([]);
    expect(
      toolCallGaps({ id: "g2", toolName: "check_report_gaps", ok: true, result: null }),
    ).toEqual([]);
    expect(
      toolCallGaps({ id: "g3", toolName: "check_report_gaps", ok: true, result: { gaps: "nope" } }),
    ).toEqual([]);
  });

  it("drops gap entries with no description and defaults bad severity to warn", () => {
    const gaps = toolCallGaps({
      id: "g4",
      toolName: "check_report_gaps",
      ok: true,
      result: {
        gaps: [
          { field: "x", description: "" },
          { field: "y", severity: "weird", description: "kept" },
        ],
      },
    });
    expect(gaps).toEqual([{ field: "y", severity: "warn", description: "kept" }]);
  });
});
