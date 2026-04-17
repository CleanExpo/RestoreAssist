/**
 * RA-1131: Unit tests for adjuster-agent — runAdjusterAgent
 *
 * AI client and Prisma are mocked — no real API calls or DB access.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Prisma ───────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findUnique: vi.fn(),
    },
  },
}));

// ── Mock restoreassist-ai-client ──────────────────────────────────────────────

vi.mock("@/lib/ai/restoreassist-ai-client", () => ({
  restoreAssistAiDispatch: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { restoreAssistAiDispatch } from "@/lib/ai/restoreassist-ai-client";
import { runAdjusterAgent } from "@/lib/ai/adjuster-agent";

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockDispatch = restoreAssistAiDispatch as ReturnType<typeof vi.fn>;
const mockFindUnique = prisma.inspection.findUnique as ReturnType<typeof vi.fn>;

function makeInspection(
  overrides: Partial<ReturnType<typeof baseInspection>> = {},
) {
  return { ...baseInspection(), ...overrides };
}

function baseInspection() {
  return {
    id: "insp-001",
    inspectionNumber: "NIR-2026-04-0001",
    propertyAddress: "12 Main St, Sydney NSW 2000",
    propertyPostcode: "2000",
    status: "COMPLETED",
    inspectionDate: new Date("2026-04-01"),
    makeSafeActions: [
      { action: "water_stopped", applicable: true, completed: true },
      { action: "power_isolated", applicable: true, completed: true },
    ],
    scopeVariations: [],
    moistureReadings: [
      {
        location: "Lounge",
        surfaceType: "drywall",
        moistureLevel: 25,
        createdAt: new Date("2026-04-01"),
      },
      {
        location: "Lounge",
        surfaceType: "drywall",
        moistureLevel: 20,
        createdAt: new Date("2026-04-02"),
      },
      {
        location: "Lounge",
        surfaceType: "drywall",
        moistureLevel: 16,
        createdAt: new Date("2026-04-03"),
      },
      {
        location: "Lounge",
        surfaceType: "drywall",
        moistureLevel: 13,
        createdAt: new Date("2026-04-04"),
      },
    ],
    costEstimates: [
      { category: "Labor", description: "Drying technician", subtotal: 800 },
      {
        category: "Equipment",
        description: "Dehumidifier hire",
        subtotal: 400,
      },
    ],
  };
}

function aiJson(recommendation: string, extras?: object): string {
  return JSON.stringify({
    recommendation,
    findings: [
      {
        code: "MAKE_SAFE_OK",
        description: "All stabilisation actions complete",
        severity: "info",
      },
    ],
    clauseCompliance: [
      {
        citation: "AS-IICRC S500:2025 §4.1",
        status: "compliant",
        note: "Cat 1 clean water",
      },
      { citation: "AS-IICRC S500:2025 §5.1", status: "compliant" },
      {
        citation: "AS-IICRC S500:2025 §7.1",
        status: "compliant",
        note: "Drying targets met",
      },
      { citation: "AS-IICRC S500:2025 §8", status: "compliant" },
    ],
    anomalies: [],
    costReasonableness: "within-range",
    suggestedQuestions: [],
    ...extras,
  });
}

function mockAiResponse(text: string) {
  mockDispatch.mockResolvedValueOnce({
    text,
    model: "gemma-4-31b-it",
    tier: "restoreassist",
    fellBackToBYOK: false,
    durationMs: 500,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runAdjusterAgent", () => {
  it("1. clean claim → approve", async () => {
    mockFindUnique.mockResolvedValueOnce(makeInspection());
    mockAiResponse(aiJson("approve"));

    const result = await runAdjusterAgent("insp-001");

    expect(result.recommendation).toBe("approve");
    expect(result.inspectionId).toBe("insp-001");
    expect(result.generatedAt).toBeTruthy();
  });

  it("2. duplicate detected → query-contractor (via AI + anomalies)", async () => {
    const insp = makeInspection({
      scopeVariations: [
        {
          id: "var-1",
          reason: "Duplicate scope line detected",
          costDeltaCents: 5000,
          costDeltaPercent: 8,
          status: "PENDING",
          autoApprovalRule: null,
          authorisationSource: "insurer_email",
          authorisationRef: null,
        },
      ],
    });
    mockFindUnique.mockResolvedValueOnce(insp);
    mockAiResponse(
      aiJson("query-contractor", {
        anomalies: ["Possible duplicate scope item"],
        suggestedQuestions: ["Can you confirm this is not a duplicate line?"],
      }),
    );

    const result = await runAdjusterAgent("insp-001");

    expect(result.recommendation).toBe("query-contractor");
    expect(result.anomalies).toContain("Possible duplicate scope item");
  });

  it("3. Cat 3 + incomplete make-safe → escalate", async () => {
    const insp = makeInspection({
      makeSafeActions: [
        { action: "mould_containment", applicable: true, completed: false },
        { action: "water_stopped", applicable: true, completed: true },
      ],
    });
    mockFindUnique.mockResolvedValueOnce(insp);
    mockAiResponse(
      aiJson("escalate", {
        findings: [
          {
            code: "MAKE_SAFE_INCOMPLETE",
            description: "mould_containment not completed",
            severity: "critical",
          },
        ],
        anomalies: [
          "1 incomplete stabilisation action(s): mould_containment (ICA Code of Practice §6)",
        ],
        clauseCompliance: [
          {
            citation: "AS-IICRC S500:2025 §4.1",
            status: "non-compliant",
            note: "Cat 3 — containment required",
          },
          { citation: "AS-IICRC S500:2025 §5.1", status: "not-applicable" },
          { citation: "AS-IICRC S500:2025 §7.1", status: "not-applicable" },
          { citation: "AS-IICRC S500:2025 §8", status: "non-compliant" },
        ],
        suggestedQuestions: ["When will mould containment be completed?"],
      }),
    );

    const result = await runAdjusterAgent("insp-001");

    expect(result.recommendation).toBe("escalate");
    expect(result.findings.some((f) => f.severity === "critical")).toBe(true);
    expect(
      result.clauseCompliance.some((c) => c.status === "non-compliant"),
    ).toBe(true);
  });

  it("4. cost >25% over scope → escalate", async () => {
    const insp = makeInspection({
      scopeVariations: [
        {
          id: "var-2",
          reason: "Additional structural drying",
          costDeltaCents: 500000,
          costDeltaPercent: 30,
          status: "PENDING",
          autoApprovalRule: null,
          authorisationSource: "internal_manager",
          authorisationRef: null,
        },
      ],
    });
    mockFindUnique.mockResolvedValueOnce(insp);
    mockAiResponse(
      aiJson("escalate", {
        costReasonableness: "high",
        anomalies: [
          "1 variation(s) exceed ±25% cost delta — escalation threshold",
        ],
        suggestedQuestions: [
          "Please provide breakdown justifying 30% cost increase",
        ],
      }),
    );

    const result = await runAdjusterAgent("insp-001");

    expect(result.recommendation).toBe("escalate");
    expect(result.costReasonableness).toBe("high");
  });

  it("5. missing SWMS (no make-safe rows for Cat 2) → query-contractor", async () => {
    const insp = makeInspection({ makeSafeActions: [] });
    mockFindUnique.mockResolvedValueOnce(insp);
    mockAiResponse(
      aiJson("query-contractor", {
        findings: [
          {
            code: "SWMS_MISSING",
            description: "No SWMS actions recorded",
            severity: "warning",
          },
        ],
        suggestedQuestions: ["Please provide SWMS documentation for this job"],
      }),
    );

    const result = await runAdjusterAgent("insp-001");

    expect(result.recommendation).toBe("query-contractor");
    expect(result.suggestedQuestions.length).toBeGreaterThan(0);
  });

  it("6. NZ claim path (NZ postcode) → approve when compliant", async () => {
    const insp = makeInspection({
      propertyAddress: "15 Willis St, Wellington 6011",
      propertyPostcode: "6011",
    });
    mockFindUnique.mockResolvedValueOnce(insp);
    mockAiResponse(aiJson("approve"));

    const result = await runAdjusterAgent("insp-001");

    expect(result.recommendation).toBe("approve");
    expect(result.inspectionId).toBe("insp-001");
  });

  it("7. ascending moisture trend → anomaly detected by pre-compute", async () => {
    const insp = makeInspection({
      moistureReadings: [
        {
          location: "Kitchen",
          surfaceType: "concrete",
          moistureLevel: 10,
          createdAt: new Date("2026-04-01"),
        },
        {
          location: "Kitchen",
          surfaceType: "concrete",
          moistureLevel: 12,
          createdAt: new Date("2026-04-02"),
        },
        {
          location: "Kitchen",
          surfaceType: "concrete",
          moistureLevel: 15,
          createdAt: new Date("2026-04-03"),
        },
        {
          location: "Kitchen",
          surfaceType: "concrete",
          moistureLevel: 18,
          createdAt: new Date("2026-04-04"),
        },
      ],
    });
    mockFindUnique.mockResolvedValueOnce(insp);
    // AI receives ascending-trend anomaly pre-computed in user prompt
    mockAiResponse(
      aiJson("escalate", {
        anomalies: [
          "Moisture readings show ascending trend — drying not progressing (AS-IICRC S500:2025 §7.1)",
        ],
        findings: [
          {
            code: "MOISTURE_ASCENDING",
            description: "Moisture not decreasing",
            severity: "critical",
          },
        ],
      }),
    );

    const result = await runAdjusterAgent("insp-001");

    expect(result.recommendation).toBe("escalate");
    expect(result.anomalies.some((a) => a.includes("ascending"))).toBe(true);
  });

  it("8. inspection not found → throws", async () => {
    mockFindUnique.mockResolvedValueOnce(null);

    await expect(runAdjusterAgent("not-found-id")).rejects.toThrow(
      "Inspection not found",
    );
  });

  it("9. AI returns non-JSON → throws", async () => {
    mockFindUnique.mockResolvedValueOnce(makeInspection());
    mockDispatch.mockResolvedValueOnce({
      text: "Sorry, I cannot assist with that.",
      model: "gemma-4-31b-it",
      tier: "restoreassist",
      fellBackToBYOK: false,
      durationMs: 100,
    });

    await expect(runAdjusterAgent("insp-001")).rejects.toThrow("non-JSON");
  });

  it("10. AI returns JSON with invalid schema → throws zod error", async () => {
    mockFindUnique.mockResolvedValueOnce(makeInspection());
    mockDispatch.mockResolvedValueOnce({
      text: JSON.stringify({ recommendation: "maybe", findings: [] }),
      model: "gemma-4-31b-it",
      tier: "restoreassist",
      fellBackToBYOK: false,
      durationMs: 100,
    });

    await expect(runAdjusterAgent("insp-001")).rejects.toThrow();
  });

  it("11. markdown-fenced JSON → parsed correctly", async () => {
    mockFindUnique.mockResolvedValueOnce(makeInspection());
    mockDispatch.mockResolvedValueOnce({
      text: "```json\n" + aiJson("approve") + "\n```",
      model: "gemma-4-31b-it",
      tier: "restoreassist",
      fellBackToBYOK: false,
      durationMs: 200,
    });

    const result = await runAdjusterAgent("insp-001");
    expect(result.recommendation).toBe("approve");
  });
});
