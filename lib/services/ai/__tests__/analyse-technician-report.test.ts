import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the substrate helper directly — this service composes tryClaudeModels
// (multi-model fallback) rather than the single-model anthropic-gateway.
vi.mock("@/lib/anthropic-models", () => ({
  tryClaudeModels: vi.fn(),
}));

// Prompt-cache helper is harmless but imported by the service; stub it so the
// test doesn't need to evaluate the real cache-block builder.
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
import { tryClaudeModels } from "@/lib/anthropic-models";

function mockTextResponse(text: string) {
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
    vi.mocked(tryClaudeModels).mockReset();
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
    vi.mocked(tryClaudeModels).mockResolvedValueOnce(
      mockTextResponse(JSON.stringify(payload)),
    );

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
    expect(tryClaudeModels).toHaveBeenCalledTimes(1);
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
    vi.mocked(tryClaudeModels).mockResolvedValueOnce(mockTextResponse(fenced));

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
    vi.mocked(tryClaudeModels).mockResolvedValueOnce(
      mockTextResponse(plainText),
    );

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

  it("maps 429 from tryClaudeModels to RATE_LIMITED", async () => {
    vi.mocked(tryClaudeModels).mockRejectedValueOnce({
      status: 429,
      message: "rate limit",
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
