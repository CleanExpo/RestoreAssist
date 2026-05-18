import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/ai/anthropic-gateway", () => ({
  callAnthropic: vi.fn(),
}));

import {
  generateClientSummaryService,
  type ClientSummaryInput,
} from "../generate-client-summary";
import { callAnthropic } from "@/lib/services/ai/anthropic-gateway";

// A valid summary fixture that satisfies every validator rule (matches the
// existing lib/ai/client-summary.test.ts VALID_SAMPLE — keeps test parity).
const VALID_SAMPLE =
  "Your home at 12 Main Street, Sydney has been inspected after a burst pipe. " +
  "About 28 square metres of flooring and plasterboard have been affected. " +
  "Because the water was dirty, the damage is treated as Category 3 under the " +
  "Australian restoration standard (IICRC S500:3.1). Damaged plasterboard will " +
  "be removed and industrial drying equipment will run in your home for around " +
  "two weeks so everything returns to safe moisture levels. Where mould is " +
  "found, it will be cleaned using safe methods (IICRC S520:12.2). After drying " +
  "is complete, new materials will be installed and the area cleaned so your " +
  "home is back to normal.\n\n" +
  "What this means for you: your home will be dried, cleaned and repaired " +
  "over about three weeks, with checks at every stage before sign-off.";

const SAMPLE_INPUT: ClientSummaryInput = {
  reportId: "rep-123",
  propertyAddress: "12 Main St, Sydney NSW 2000",
  hazardType: "WATER",
  waterCategory: "3",
  waterClass: "3",
  affectedArea: 28,
  estimatedDryingTime: 336,
};

function mockMessage(text: string) {
  return {
    ok: true as const,
    data: {
      id: "msg_xxx",
      content: [{ type: "text", text }],
    } as never,
  };
}

describe("generateClientSummaryService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(callAnthropic).mockReset();
  });

  it("returns ok with attempts=1, fellBack=false when the first draft passes validation", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce(mockMessage(VALID_SAMPLE));

    const r = await generateClientSummaryService({
      apiKey: "sk-resolved",
      input: SAMPLE_INPUT,
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.fellBack).toBe(false);
      expect(r.data.attempts).toBe(1);
      expect(r.data.summary).toBe(VALID_SAMPLE);
    }
    expect(callAnthropic).toHaveBeenCalledTimes(1);
  });

  it("retries once when the first draft fails validation, then returns the valid retry", async () => {
    const badDraft = VALID_SAMPLE.replace(/\(IICRC S\d+:\d+\)/g, "").replace(
      /S\d+:\d+/g,
      "",
    );
    vi.mocked(callAnthropic)
      .mockResolvedValueOnce(mockMessage(badDraft))
      .mockResolvedValueOnce(mockMessage(VALID_SAMPLE));

    const r = await generateClientSummaryService({
      apiKey: "sk-resolved",
      input: SAMPLE_INPUT,
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.fellBack).toBe(false);
      expect(r.data.attempts).toBe(2);
      expect(r.data.summary).toBe(VALID_SAMPLE);
    }
    expect(callAnthropic).toHaveBeenCalledTimes(2);
  });

  it("falls back to the deterministic safe template when both attempts fail validation", async () => {
    const tooShort = "Not enough words. Nothing useful here.";
    const stillBad = "Still too short, still missing everything.";
    vi.mocked(callAnthropic)
      .mockResolvedValueOnce(mockMessage(tooShort))
      .mockResolvedValueOnce(mockMessage(stillBad));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await generateClientSummaryService({
      apiKey: "sk-resolved",
      input: SAMPLE_INPUT,
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.fellBack).toBe(true);
      expect(r.data.attempts).toBe(2);
      expect(r.data.summary).toContain("What this means for you");
      // The fallback template embeds the property address.
      expect(r.data.summary).toContain("12 Main St, Sydney NSW 2000");
    }
    expect(callAnthropic).toHaveBeenCalledTimes(2);

    warnSpy.mockRestore();
  });

  it("propagates gateway RATE_LIMITED reason verbatim without retrying", async () => {
    vi.mocked(callAnthropic).mockResolvedValueOnce({
      ok: false,
      reason: "RATE_LIMITED",
      detail: "rate limited by upstream",
      retryAfterMs: 30000,
    });

    const r = await generateClientSummaryService({
      apiKey: "sk-resolved",
      input: SAMPLE_INPUT,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("RATE_LIMITED");
      expect(r.retryAfterMs).toBe(30000);
    }
    // Gateway failure must NOT trigger the validation retry — only validation
    // failures consume the second attempt budget.
    expect(callAnthropic).toHaveBeenCalledTimes(1);
  });
});
