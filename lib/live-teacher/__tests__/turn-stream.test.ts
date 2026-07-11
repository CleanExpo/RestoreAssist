import { describe, it, expect } from "vitest";
import { parseTurnFrames, streamTurn, type TurnEvent } from "../turn-stream";

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
