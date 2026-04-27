/**
 * RA-1461 — unit tests for generateClientSummary and validate().
 *
 * The Anthropic SDK is mocked — no real API calls. Fixtures cover the five
 * claim types called out in the ticket (WATER / FIRE / MOULD / STORM /
 * BIOHAZARD) plus the retry path and the safe-template fallback.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  generateClientSummary,
  safeTemplate,
  validate,
  SYSTEM_PROMPT,
  CLIENT_SUMMARY_MODEL,
  type ClientSummaryInput,
} from "@/lib/ai/client-summary";

// A valid summary fixture that satisfies every rule.
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

// ─── Validator unit tests ───────────────────────────────────────────────────

describe("validate()", () => {
  it("accepts a well-formed summary", () => {
    expect(validate(VALID_SAMPLE)).toBeNull();
  });

  it("rejects summaries over 160 words", () => {
    const padded = `${VALID_SAMPLE} ${"extra ".repeat(60)}`;
    const reason = validate(padded);
    expect(reason).toMatch(/160/);
  });

  it("rejects summaries without an IICRC citation", () => {
    const stripped = VALID_SAMPLE.replace(/\(IICRC S\d+:\d+\)/g, "").replace(
      /S\d+:\d+/g,
      "",
    );
    const reason = validate(stripped);
    expect(reason).toMatch(/IICRC/);
  });

  it("rejects summaries that do not address the reader as 'you'", () => {
    // Replace whole-word "you", "your", "you're", "yours" only.
    const neutralised = VALID_SAMPLE.replace(/\byou(r|rs|'re)?\b/gi, "the owner");
    const reason = validate(neutralised);
    expect(reason).toMatch(/you/);
  });

  it("rejects summaries missing the 'What this means for you:' closer", () => {
    const noCloser = VALID_SAMPLE.replace(/What this means for you:[\s\S]*/, "");
    const reason = validate(noCloser);
    expect(reason).toMatch(/What this means for you/);
  });

  it("rejects summaries that use banned words", () => {
    for (const banned of [
      "tapestry",
      "leverage",
      "robust",
      "synergy",
      "holistic",
      "streamline",
    ]) {
      const bad = VALID_SAMPLE.replace(
        "checks at every stage",
        `${banned} checks at every stage`,
      );
      const reason = validate(bad);
      expect(reason, `expected '${banned}' to be rejected`).toContain(banned);
    }
  });

  it("rejects summaries that are far too short", () => {
    const tooShort = "Your home was damaged (IICRC S500:3.1). What this means for you: we will fix it.";
    expect(validate(tooShort)).toMatch(/words/);
  });
});

// ─── safeTemplate() fixtures ────────────────────────────────────────────────

describe("safeTemplate()", () => {
  const fixtures: Record<string, ClientSummaryInput> = {
    WATER: {
      reportId: "rep-water",
      propertyAddress: "12 Main St, Sydney NSW 2000",
      hazardType: "WATER",
      waterCategory: "3",
      waterClass: "3",
      affectedArea: 28,
      estimatedDryingTime: 336,
      biologicalMouldDetected: false,
    },
    FIRE: {
      reportId: "rep-fire",
      propertyAddress: "4/22 Beach Rd, Gold Coast QLD 4217",
      hazardType: "FIRE",
      affectedArea: 42,
    },
    MOULD: {
      reportId: "rep-mould",
      propertyAddress: "7 Park Ave, Melbourne VIC 3000",
      hazardType: "MOULD",
      biologicalMouldDetected: true,
      affectedArea: 12,
    },
    STORM: {
      reportId: "rep-storm",
      propertyAddress: "33 Ocean Dr, Perth WA 6000",
      hazardType: "STORM",
      affectedArea: 80,
      estimatedDryingTime: 96,
    },
    BIOHAZARD: {
      reportId: "rep-bio",
      propertyAddress: "99 Elm St, Hobart TAS 7000",
      hazardType: "BIOHAZARD",
      waterCategory: "3",
      safetyHazards: "Sewage contamination",
    },
  };

  for (const [claimType, input] of Object.entries(fixtures)) {
    it(`produces a valid summary for a ${claimType} job`, () => {
      const summary = safeTemplate(input);
      const reason = validate(summary);
      expect(
        reason,
        `${claimType} fallback failed validation: ${reason ?? ""}\n\nSummary:\n${summary}`,
      ).toBeNull();
    });
  }
});

// ─── generateClientSummary() — end-to-end with mocked client ────────────────

function mockClient(responses: string[]) {
  let call = 0;
  const create = vi.fn(async () => {
    const text = responses[Math.min(call, responses.length - 1)];
    call++;
    return {
      content: [{ type: "text", text }],
    } as any;
  });
  return {
    client: { messages: { create } } as any,
    create,
  };
}

const SAMPLE_INPUT: ClientSummaryInput = {
  reportId: "rep-123",
  propertyAddress: "12 Main St, Sydney NSW 2000",
  hazardType: "WATER",
  waterCategory: "3",
  waterClass: "3",
  affectedArea: 28,
  estimatedDryingTime: 336,
};

describe("generateClientSummary()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the first draft when it passes validation", async () => {
    const { client, create } = mockClient([VALID_SAMPLE]);

    const result = await generateClientSummary(client, SAMPLE_INPUT);

    expect(result.fellBack).toBe(false);
    expect(result.attempts).toBe(1);
    expect(result.rejections).toEqual([]);
    expect(result.summary).toBe(VALID_SAMPLE);
    expect(create).toHaveBeenCalledTimes(1);

    // Verify the call used Haiku 4.5 + cached system prompt.
    const arg = create.mock.calls[0][0];
    expect(arg.model).toBe(CLIENT_SUMMARY_MODEL);
    expect(arg.system[0].text).toBe(SYSTEM_PROMPT);
    expect(arg.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(arg.temperature).toBe(0.2);
    expect(arg.max_tokens).toBe(300);
  });

  it("retries once if the first draft fails validation, then succeeds", async () => {
    const badDraft = VALID_SAMPLE.replace(/\(IICRC S\d+:\d+\)/g, "").replace(
      /S\d+:\d+/g,
      "",
    );
    const { client, create } = mockClient([badDraft, VALID_SAMPLE]);

    const result = await generateClientSummary(client, SAMPLE_INPUT);

    expect(result.fellBack).toBe(false);
    expect(result.attempts).toBe(2);
    expect(result.rejections).toHaveLength(1);
    expect(result.rejections[0]).toMatch(/IICRC/);
    expect(result.summary).toBe(VALID_SAMPLE);
    expect(create).toHaveBeenCalledTimes(2);

    // The retry call must include the rejection reason so the model can self-correct.
    const secondCall = create.mock.calls[1][0];
    expect(secondCall.messages[0].content).toContain("IICRC");
  });

  it("falls back to the safe template when both attempts fail", async () => {
    const badDraft = "Not enough words. Nothing here.";
    const stillBadDraft = "Still too short, still missing everything.";
    const { client, create } = mockClient([badDraft, stillBadDraft]);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await generateClientSummary(client, SAMPLE_INPUT);

    expect(result.fellBack).toBe(true);
    expect(result.attempts).toBe(2);
    expect(result.rejections).toHaveLength(2);
    expect(create).toHaveBeenCalledTimes(2);

    // The fallback itself must pass every validator rule.
    expect(validate(result.summary)).toBeNull();

    warnSpy.mockRestore();
  });

  it("never calls the model more than twice", async () => {
    const bad = "Too short.";
    const { client, create } = mockClient([bad, bad, bad, bad]);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await generateClientSummary(client, SAMPLE_INPUT);

    expect(create).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });
});
