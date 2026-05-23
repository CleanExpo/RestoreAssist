/**
 * AI-driven structured extraction over a technician's free-text field report.
 *
 * Composes the multi-model-fallback gateway helper
 * (lib/services/ai/anthropic-gateway.callAnthropicWithFallback). The route
 * owns auth, rate-limit, idempotency, subscription gate, ownership check,
 * and persistence.
 *
 * Graceful-PARSE-fail semantic: when the model output isn't valid JSON, the
 * service returns ok() with a structured fallback that preserves the raw
 * model text in `observations`. Parse failures never bubble as a failed
 * ServiceResult — the legacy route's behaviour is preserved exactly so
 * downstream UI keeps rendering. API/gateway failures still surface as
 * {ok: false, reason: AnthropicReason}.
 *
 * @see .claude/skills/service-layer-architecture/SKILL.md
 */

import { createCachedSystemPrompt } from "@/lib/anthropic/features/prompt-cache";
import { ok, type ServiceResult } from "@/lib/services/_shared/result";
import {
  callAnthropicWithFallback,
  type AnthropicReason,
} from "./anthropic-gateway";

const SYSTEM_PROMPT = `You are an expert water damage restoration specialist. Analyze technician field reports and extract structured information accurately. Always return valid JSON.`;

const MAX_TOKENS = 2000;

export type AnalyseTechReportReason = AnthropicReason;

export interface TechReportInput {
  technicianFieldReport: string;
  propertyAddress: string | null;
  propertyPostcode: string | null;
  incidentDate: Date | null;
  technicianAttendanceDate: Date | null;
}

export interface TechReportAnalysis {
  affectedAreas: string[];
  waterSource: string;
  waterCategory: string;
  affectedMaterials: string[];
  equipmentDeployed: string[];
  moistureReadings: string[];
  hazardsIdentified: string[];
  observations: string;
  complexityLevel: "simple" | "moderate" | "complex";
}

function fallbackAnalysis(analysisText: string): TechReportAnalysis {
  return {
    affectedAreas: [],
    waterSource: "Not specified",
    waterCategory: "Not specified",
    affectedMaterials: [],
    equipmentDeployed: [],
    moistureReadings: [],
    hazardsIdentified: [],
    observations: analysisText,
    complexityLevel: "moderate",
  };
}

export async function analyseTechnicianReport(args: {
  apiKey: string;
  report: TechReportInput;
}): Promise<
  ServiceResult<{ analysis: TechReportAnalysis }, AnalyseTechReportReason>
> {
  const { report } = args;

  const prompt = `You are an expert water damage restoration specialist analyzing a technician's field report.

Analyze the following technician field report and extract structured information:

TECHNICIAN FIELD REPORT:
${report.technicianFieldReport}

PROPERTY INFORMATION:
- Address: ${report.propertyAddress}
- Postcode: ${report.propertyPostcode || "Not provided"}
- Incident Date: ${report.incidentDate ? new Date(report.incidentDate).toLocaleDateString("en-AU") : "Not provided"}
- Technician Attendance Date: ${report.technicianAttendanceDate ? new Date(report.technicianAttendanceDate).toLocaleDateString("en-AU") : "Not provided"}

Your task is to analyze this report and extract the following information in JSON format:

{
  "affectedAreas": ["List of rooms/areas mentioned (e.g., Kitchen, Master Bedroom, Hallway)"],
  "waterSource": "Identified water source (e.g., burst pipe, toilet overflow, roof leak, etc.)",
  "waterCategory": "Category 1, 2, or 3 based on water source",
  "affectedMaterials": ["List of materials mentioned (e.g., carpet, timber, plasterboard, yellow tongue, etc.)"],
  "equipmentDeployed": ["List of equipment mentioned (e.g., air movers, dehumidifiers, AFD units, etc.)"],
  "moistureReadings": ["List any moisture readings mentioned with locations"],
  "hazardsIdentified": ["List any hazards mentioned (e.g., mould, asbestos, electrical, etc.)"],
  "observations": "Key observations from the technician's report",
  "complexityLevel": "simple" | "moderate" | "complex" (based on number of areas, materials, hazards)
}

Be thorough and extract all relevant information. If information is not explicitly stated, use "Not specified" or empty arrays as appropriate.`;

  const gatewayResult = await callAnthropicWithFallback({
    userId: "system",
    apiKey: args.apiKey,
    request: {
      system: [createCachedSystemPrompt(SYSTEM_PROMPT)],
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    },
    agentName: "TechnicianReportAnalyzer",
    enableCacheMetrics: true,
  });

  if (!gatewayResult.ok) {
    return gatewayResult;
  }

  const response = gatewayResult.data;
  const firstBlock = response.content[0];
  const analysisText = firstBlock?.type === "text" ? firstBlock.text : "";

  if (!analysisText) {
    return ok({ analysis: fallbackAnalysis("") });
  }

  // Extract JSON from markdown fences first, then bare {...}.
  const jsonMatch =
    analysisText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) ||
    analysisText.match(/\{[\s\S]*\}/);
  const jsonText = jsonMatch ? jsonMatch[1] || jsonMatch[0] : analysisText;

  try {
    const parsed = JSON.parse(jsonText) as TechReportAnalysis;
    return ok({ analysis: parsed });
  } catch {
    // Graceful fallback — preserve raw text in observations, keep 200 status
    // at the route layer (RA-1266 / legacy behaviour).
    console.warn(
      "[analyse-technician-report] Failed to parse model JSON; returning fallback structure",
    );
    return ok({ analysis: fallbackAnalysis(analysisText) });
  }
}
