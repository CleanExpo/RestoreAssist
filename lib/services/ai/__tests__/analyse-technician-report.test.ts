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
  analyseTechnicianReport,
  type TechReportInput,
} from "../analyse-technician-report";
import { callAnthropicWithFallback } from "../anthropic-gateway";

function mockTextMessage(text: string) {
  return {
    id: "msg_xxx",
    content: [{ type: "text", text }],
  };
}

const REPORT: TechReportInput = {
  technicianFieldReport:
    "Kitchen and laundry affected. Burst pipe under sink. Carpet wet, plasterboard damaged. Deployed 4 air movers and 2 dehumidifiers. Moisture reading 28% in carpet near sink. No hazards observed.",
  propertyAddress: "12 Smith St, Sydney NSW 2000",
  propertyPostcode: "2000",
  incidentDate: new Date("2026-05-15T00:00:00Z"),
  technicianAttendanceDate: new Date("2026-05-16T00:00:00Z"),
};

describe("analyseTechnicianReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(callAnthropicWithFallback).mockReset();
  });

  it("returns ok with parsed analysis when response is valid JSON", async () => {
    const payload = {
      affectedAreas: ["Kitchen", "Laundry"],
      waterSource: "Burst pipe under sink",
      waterCategory: "Category 1",
      affectedMaterials: ["Carpet", "Plasterboard"],
      equipmentDeployed: ["4 air movers", "2 dehumidifiers"],
      moistureReadings: ["28% in carpet near sink"],
      hazardsIdentified: [],
      observations: "Cat 1 burst pipe, two areas affected.",
      complexityLevel: "moderate",
    };
    vi.mocked(callAnthropicWithFallback).mockResolvedValueOnce({
      ok: true,
      data: mockTextMessage(JSON.stringify(payload)) as any,
    });

    const r = await analyseTechnicianReport({
      apiKey: "sk-resolved",
      report: REPORT,
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.analysis.affectedAreas).toEqual(["Kitchen", "Laundry"]);
      expect(r.data.analysis.waterCategory).toBe("Category 1");
      expect(r.data.analysis.complexityLevel).toBe("moderate");
    }
    expect(callAnthropicWithFallback).toHaveBeenCalledTimes(1);
  });

  it("extracts JSON wrapped in markdown fences", async () => {
    const payload = {
      affectedAreas: ["Bathroom"],
      waterSource: "Toilet overflow",
      waterCategory: "Category 3",
      affectedMaterials: ["Vinyl flooring"],
      equipmentDeployed: ["AFD unit"],
      moistureReadings: [],
      hazardsIdentified: ["Sewage contamination"],
      observations: "Cat 3 incident requires PPE.",
      complexityLevel: "complex",
    };
    const fenced = "```json\n" + JSON.stringify(payload) + "\n```";
    vi.mocked(callAnthropicWithFallback).mockResolvedValueOnce({
      ok: true,
      data: mockTextMessage(fenced) as any,
    });

    const r = await analyseTechnicianReport({
      apiKey: "sk-resolved",
      report: REPORT,
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.analysis.affectedAreas).toEqual(["Bathroom"]);
      expect(r.data.analysis.waterCategory).toBe("Category 3");
      expect(r.data.analysis.hazardsIdentified).toEqual([
        "Sewage contamination",
      ]);
    }
  });

  it("falls back to a graceful structured analysis when response is unparseable", async () => {
    const plainText = "Cannot parse this report";
    vi.mocked(callAnthropicWithFallback).mockResolvedValueOnce({
      ok: true,
      data: mockTextMessage(plainText) as any,
    });

    const r = await analyseTechnicianReport({
      apiKey: "sk-resolved",
      report: REPORT,
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.analysis.affectedAreas).toEqual([]);
      expect(r.data.analysis.waterSource).toBe("Not specified");
      expect(r.data.analysis.waterCategory).toBe("Not specified");
      expect(r.data.analysis.affectedMaterials).toEqual([]);
      expect(r.data.analysis.equipmentDeployed).toEqual([]);
      expect(r.data.analysis.moistureReadings).toEqual([]);
      expect(r.data.analysis.hazardsIdentified).toEqual([]);
      expect(r.data.analysis.observations).toBe(plainText);
      expect(r.data.analysis.complexityLevel).toBe("moderate");
    }
  });

  it("forwards RATE_LIMITED from the gateway", async () => {
    vi.mocked(callAnthropicWithFallback).mockResolvedValueOnce({
      ok: false,
      reason: "RATE_LIMITED",
      detail: "rate limit",
      retryAfterMs: 30000,
    });

    const r = await analyseTechnicianReport({
      apiKey: "sk-resolved",
      report: REPORT,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("RATE_LIMITED");
    }
  });
});
