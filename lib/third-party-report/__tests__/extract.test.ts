import { beforeEach, describe, expect, it, vi } from "vitest";

const { callAnthropic } = vi.hoisted(() => ({ callAnthropic: vi.fn() }));
vi.mock("@/lib/services/ai/anthropic-gateway", () => ({ callAnthropic }));

import Anthropic from "@anthropic-ai/sdk";
import {
  checkPdfBytes,
  estimatePdfPageCount,
  extractLabReport,
  LAB_EXTRACT_SYSTEM_PROMPT,
  sha256Hex,
} from "../extract";

const pdf = Buffer.from(
  "%PDF-1.4\n" +
    "1 0 obj << /Type /Page >> endobj\n2 0 obj << /Type /Page >> endobj\n" +
    "3 0 obj << /Type /Pages >> endobj\n" +
    "x".repeat(200) +
    "\n%%EOF",
);

const reply = (text: string) => ({
  ok: true,
  data: {
    content: [{ type: "text", text }],
    usage: { input_tokens: 100, output_tokens: 20 },
  },
});

describe("extractLabReport", () => {
  beforeEach(() => callAnthropic.mockReset());

  it("sends the PDF as a document block with no tools and no standards text", async () => {
    callAnthropic.mockResolvedValue(reply('{"facts":[]}'));
    await extractLabReport({ apiKey: "k", pdf });
    const call = callAnthropic.mock.calls[0]![0];
    expect(call.request.tools).toBeUndefined();
    expect(call.request.messages[0].content[0].type).toBe("document");
    expect(call.apiKey).toBe("k");
    expect(call.requestOptions.maxRetries).toBe(0);
    expect(LAB_EXTRACT_SYSTEM_PROMPT).not.toMatch(/S500|S520|AS\/NZS|IICRC/);
  });

  it("returns checked facts and token usage", async () => {
    callAnthropic.mockResolvedValue(
      reply(
        JSON.stringify({
          facts: [{ field: "labName", value: "Acme", pageRef: 2, quote: "Acme Lab" }],
        }),
      ),
    );
    const out = await extractLabReport({ apiKey: "k", pdf });
    expect(out.ok && out.data.facts).toHaveLength(1);
    expect(out.ok && out.data.usage).toEqual({ inputTokens: 100, outputTokens: 20 });
  });

  it("drops a fact whose page is beyond the document's two pages", async () => {
    callAnthropic.mockResolvedValue(
      reply(
        JSON.stringify({
          facts: [{ field: "labName", value: "Acme", pageRef: 7, quote: "Acme" }],
        }),
      ),
    );
    const out = await extractLabReport({ apiKey: "k", pdf });
    expect(out.ok && out.data.facts).toEqual([]);
    expect(out.ok && out.data.rejectedCount).toBe(1);
  });

  it("fails closed when the model returns prose", async () => {
    callAnthropic.mockResolvedValue(reply("Sure! The lab is Acme."));
    const out = await extractLabReport({ apiKey: "k", pdf });
    expect(out).toMatchObject({ ok: false, reason: "PARSE_FAILED" });
  });

  it("fails closed on an empty reply", async () => {
    callAnthropic.mockResolvedValue({ ok: true, data: { content: [] } });
    const out = await extractLabReport({ apiKey: "k", pdf });
    expect(out).toMatchObject({ ok: false, reason: "PARSE_FAILED" });
  });

  it("passes a failed AI call through with its reason", async () => {
    callAnthropic.mockResolvedValue({ ok: false, reason: "MODEL_OVERLOADED" });
    const out = await extractLabReport({ apiKey: "k", pdf });
    expect(out).toMatchObject({ ok: false, reason: "MODEL_OVERLOADED" });
  });

  it("a plain API error with the generic name is not mistaken for a timeout", async () => {
    callAnthropic.mockResolvedValue({
      ok: false,
      reason: "API_ERROR",
      cause: new Error("boom"),
    });
    const out = await extractLabReport({ apiKey: "k", pdf });
    expect(out).toMatchObject({ ok: false, reason: "API_ERROR" });
  });

  it("reports a slow AI call as TIMEOUT, and bounds the wait", async () => {
    callAnthropic.mockResolvedValue({
      ok: false,
      reason: "API_ERROR",
      cause: new Anthropic.APIConnectionTimeoutError(),
    });
    const out = await extractLabReport({ apiKey: "k", pdf, timeoutMs: 5 });
    expect(out).toMatchObject({ ok: false, reason: "TIMEOUT" });
    expect(callAnthropic.mock.calls[0]![0].requestOptions.timeout).toBe(5);
  });
});

describe("pdf helpers", () => {
  it("counts pages and ignores the /Pages tree object", () => {
    expect(estimatePdfPageCount(pdf)).toBe(2);
  });
  it("reports an unknown count for a PDF with compressed object streams", () => {
    const packed = Buffer.concat([pdf, Buffer.from("\n/Type /ObjStm\n")]);
    expect(estimatePdfPageCount(packed)).toBe(0);
  });
  it("hashes the exact bytes", () => {
    expect(sha256Hex(Buffer.from("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
  it("accepts a PDF and rejects non-PDF, tiny and oversize files", () => {
    expect(checkPdfBytes(pdf).ok).toBe(true);
    expect(checkPdfBytes(Buffer.from("GIF89a" + "x".repeat(200))).ok).toBe(false);
    expect(checkPdfBytes(Buffer.from("%PDF-")).ok).toBe(false);
    expect(checkPdfBytes(Buffer.alloc(21 * 1024 * 1024, "a")).ok).toBe(false);
  });
});
