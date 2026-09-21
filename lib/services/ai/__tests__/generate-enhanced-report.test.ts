import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the gateway helper — this service now composes
// callAnthropicWithFallback (which wraps tryClaudeModels under the hood).
vi.mock("../anthropic-gateway", () => ({
  callAnthropicWithFallback: vi.fn(),
}));

vi.mock("@/lib/anthropic/features/prompt-cache", () => ({
  createCachedSystemPrompt: (text: string) => ({
    type: "text",
    text,
    cache_control: { type: "ephemeral" },
  }),
}));

import {
  generateEnhancedReport,
  collectEnhancedReportPromptBlob,
  resolveEnhancedReportStateInfo,
  type GenerateEnhancedInput,
} from "../generate-enhanced-report";
import { callAnthropicWithFallback } from "../anthropic-gateway";
import { getStateInfo } from "@/lib/state-detection";
import {
  auQldLinkHits,
  auQldStatuteHits,
} from "@/lib/__tests__/au-qld-law-scan";

function mockTextMessage(text: string) {
  return {
    id: "msg_xxx",
    content: [{ type: "text", text }],
  };
}

const INPUT: GenerateEnhancedInput = {
  technicianNotes:
    "Kitchen flooded from burst pipe. Carpet wet, plasterboard damaged.",
  dateOfAttendance: "2026-05-15",
  clientContacted: "Spoke with owner; arranged access.",
  clientName: "Jane Doe",
  propertyAddress: "12 Smith St, Sydney NSW 2000",
  clientEmail: "jane@example.com",
  clientPhone: "0400 000 000",
  technicianName: "Alex Smith",
  photos: [],
  conversationHistory: [],
  standardsContext: "",
};

describe("generateEnhancedReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(callAnthropicWithFallback).mockReset();
  });

  it("returns ok with enhancedReport when model returns text", async () => {
    const reportText =
      "# Professional Inspection Report\n\nDetailed report text referencing ANSI/IICRC S500:2021.";
    vi.mocked(callAnthropicWithFallback).mockResolvedValueOnce({
      ok: true,
      data: mockTextMessage(reportText) as any,
    });

    const r = await generateEnhancedReport({
      apiKey: "sk-resolved",
      input: INPUT,
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.enhancedReport).toBe(reportText);
    }
    expect(callAnthropicWithFallback).toHaveBeenCalledTimes(1);
  });

  it("returns ok with stringified content when first block is not text type", async () => {
    // Defensive: if the SDK returns a non-text block first, the service must
    // still produce a non-empty enhancedReport (matches legacy route behaviour).
    const nonTextBlock = { type: "tool_use", name: "fake", input: { x: 1 } };
    vi.mocked(callAnthropicWithFallback).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_xxx",
        content: [nonTextBlock],
      } as any,
    });

    const r = await generateEnhancedReport({
      apiKey: "sk-resolved",
      input: INPUT,
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.enhancedReport).toContain("tool_use");
    }
  });

  it("returns API_ERROR when model returns empty content (legacy 500 path)", async () => {
    vi.mocked(callAnthropicWithFallback).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "msg_xxx",
        content: [{ type: "text", text: "" }],
      } as any,
    });

    const r = await generateEnhancedReport({
      apiKey: "sk-resolved",
      input: INPUT,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("API_ERROR");
    }
  });

  it("forwards RATE_LIMITED from the gateway", async () => {
    vi.mocked(callAnthropicWithFallback).mockResolvedValueOnce({
      ok: false,
      reason: "RATE_LIMITED",
      detail: "rate limit",
      retryAfterMs: 30000,
    });

    const r = await generateEnhancedReport({
      apiKey: "sk-resolved",
      input: INPUT,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("RATE_LIMITED");
    }
  });

  it("RA-7599: NZ jobs send the New Zealand system prompt, not the Australia-locked one", async () => {
    vi.mocked(callAnthropicWithFallback).mockResolvedValueOnce({
      ok: true,
      data: mockTextMessage("NZ draft") as any,
    });

    await generateEnhancedReport({
      apiKey: "sk-resolved",
      input: { ...INPUT, stateInfo: getStateInfo("NZ") },
    });

    const request = vi.mocked(callAnthropicWithFallback).mock.calls[0][0];
    const system = JSON.stringify(request.request.system);
    const user = request.request.messages[0].content;
    expect(system).toContain("operating in New Zealand");
    expect(system).not.toContain("operating in Australia");
    expect(auQldStatuteHits(`${system}\n${user}`)).toEqual([]);
  });
});

/**
 * RA-7599 — enhanced-report generation must not instruct the model to emit
 * Australian or Queensland law on a New Zealand job.
 *
 * Same fail-closed matcher as RA-7361 / #2228: the QLD control must still
 * carry those statutes, or an empty scanner would make every NZ assertion
 * pass for a reason unrelated to New Zealand.
 */
function promptBlob(code: "NZ" | "QLD" | null, extra?: Partial<GenerateEnhancedInput>) {
  return collectEnhancedReportPromptBlob({
    ...INPUT,
    propertyAddress:
      code === "NZ"
        ? "12 Queen Street, Auckland 1010, New Zealand"
        : code === "QLD"
          ? "12 Smith St, Brisbane QLD 4000"
          : INPUT.propertyAddress,
    stateInfo: code ? getStateInfo(code) : null,
    ...extra,
  });
}

describe("enhanced-report prompts (RA-7599)", () => {
  it("QLD control still surfaces Australian/Queensland statutes", () => {
    const qld = promptBlob("QLD");
    expect(qld).toContain("Work Health and Safety Act 2011");
    expect(qld).toContain("National Construction Code");
    expect(
      auQldStatuteHits(qld),
      "AU control: QLD enhanced-report prompt must still carry Australian/Queensland statutes so the NZ scan can fail",
    ).not.toEqual([]);
  });

  it("NZ jobs cite HSWA 2015 and never AU/QLD statute text or links", () => {
    const nz = promptBlob("NZ");
    expect(nz).toContain("Health and Safety at Work Act 2015 (NZ)");
    expect(nz).toContain("WorkSafe New Zealand");
    expect(auQldStatuteHits(nz)).toEqual([]);
    expect(auQldLinkHits(nz)).toEqual([]);
  });

  it("unknown jurisdiction hides Australian statutes rather than inventing them", () => {
    const unknown = promptBlob(null);
    expect(unknown).toContain("Jurisdiction was not recorded");
    expect(auQldStatuteHits(unknown)).toEqual([]);
    expect(auQldLinkHits(unknown)).toEqual([]);
  });

  it("NZ jobs drop AU-weighted Drive standards context rather than forwarding it", () => {
    const leak =
      "Cite the National Construction Code and Work Health and Safety Act 2011. See https://www.safeworkaustralia.gov.au/safety-topic/hazards/asbestos";
    expect(
      auQldStatuteHits(leak),
      "control: the planted Drive excerpt must itself match so a dropped-context assertion cannot pass vacuously",
    ).not.toEqual([]);
    expect(auQldLinkHits(leak)).not.toEqual([]);

    const nz = promptBlob("NZ", { standardsContext: leak });
    expect(auQldStatuteHits(nz)).toEqual([]);
    expect(auQldLinkHits(nz)).toEqual([]);
    expect(nz).not.toContain("safeworkaustralia.gov.au");

    const qld = promptBlob("QLD", { standardsContext: leak });
    expect(auQldStatuteHits(qld)).not.toEqual([]);
  });
});

describe("resolveEnhancedReportStateInfo (RA-7599)", () => {
  it("a positive NZ country wins over an overlapping Australian postcode", () => {
    const nz = resolveEnhancedReportStateInfo({
      propertyPostcode: "4000",
      inspectionCountry: "NZ",
    });
    expect(nz?.code).toBe("NZ");
    expect(nz?.whsAct).toBe("Health and Safety at Work Act 2015 (NZ)");
  });

  it("an address that names New Zealand is NZ even when the postcode overlaps AU", () => {
    const nz = resolveEnhancedReportStateInfo({
      propertyAddress: "12 Queen Street, Auckland 1010, New Zealand",
    });
    expect(nz?.code).toBe("NZ");
  });

  it("without an NZ country, 4000 still resolves to Queensland", () => {
    const qld = resolveEnhancedReportStateInfo({
      propertyAddress: "12 Smith St, Brisbane QLD 4000",
    });
    expect(qld?.code).toBe("QLD");
  });

  it("returns null when neither country nor postcode identifies a jurisdiction", () => {
    expect(resolveEnhancedReportStateInfo({})).toBeNull();
    expect(
      resolveEnhancedReportStateInfo({
        propertyAddress: "somewhere unmarked",
      }),
    ).toBeNull();
  });
});
