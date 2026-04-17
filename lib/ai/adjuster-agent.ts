/**
 * RA-1131: Adjuster AI Agent — structured claim review with AU/NZ insurance compliance.
 *
 * Single-pass analyzer. Collects compliance signals from the database, builds a
 * structured prompt, calls RestoreAssist AI, and returns a zod-validated
 * AdjusterRecommendation object. Does NOT persist AI output.
 *
 * Legal references:
 *   - AS-IICRC S500:2025 §4.1 (water category), §5.1 (water class), §7.1 (drying)
 *   - ICA Code of Practice §3 (claims handling), §6 (make-safe obligations)
 *   - Insurance Contracts Act 1984 (Cth) §13 (duty of utmost good faith)
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { restoreAssistAiDispatch } from "@/lib/ai/restoreassist-ai-client";

// ── Output schema ────────────────────────────────────────────────────────────

export const FindingSchema = z.object({
  code: z.string(),
  description: z.string(),
  severity: z.enum(["info", "warning", "critical"]),
});

export const ClauseComplianceSchema = z.object({
  citation: z.string(), // e.g. "AS-IICRC S500:2025 §4.1"
  status: z.enum(["compliant", "non-compliant", "not-applicable"]),
  note: z.string().optional(),
});

export const AdjusterRecommendationSchema = z.object({
  recommendation: z.enum(["approve", "query-contractor", "escalate"]),
  findings: z.array(FindingSchema),
  clauseCompliance: z.array(ClauseComplianceSchema),
  anomalies: z.array(z.string()),
  costReasonableness: z.enum(["within-range", "high", "low"]),
  suggestedQuestions: z.array(z.string()),
  inspectionId: z.string(),
  generatedAt: z.string(), // ISO timestamp
});

export type AdjusterRecommendation = z.infer<
  typeof AdjusterRecommendationSchema
>;
export type AdjusterFinding = z.infer<typeof FindingSchema>;

// ── System prompt ─────────────────────────────────────────────────────────────

const ADJUSTER_SYSTEM_PROMPT = `You are an expert insurance adjuster AI for Australian and New Zealand water damage restoration claims.

Your task: perform a single-pass structured audit of the provided claim data and return a JSON object matching the schema exactly.

Legal framework:
- AS-IICRC S500:2025 (Water Damage Restoration Standard): §4.1 water category, §5.1 water class, §7.1 drying targets, §8 documentation requirements
- ICA Code of Practice §3.1 (claims handling timeliness), §6 (make-safe / stabilisation obligations)
- Insurance Contracts Act 1984 (Cth) §13 (duty of utmost good faith)

Decision rules:
- recommendation = "approve" when: make-safe complete, SWMS present for Cat 3 or Class 3+, no duplicate job detected, cost within ±25% of NRPG range, moisture readings trend downward
- recommendation = "query-contractor" when: minor gaps (missing SWMS on Cat 1/2, missing auth ref on variation), cost 10–25% over, plateau moisture trend
- recommendation = "escalate" when: Cat 3 + no SWMS, duplicate job detected, cost >25% over scope, ascending moisture trend, missing make-safe on hazard actions
- costReasonableness = "within-range" when total cost is within ±10% of scope baseline, "high" when >10% over, "low" when >10% under
- Include a clauseCompliance entry for each of §4.1, §5.1, §7.1, §8 — mark "not-applicable" if data is absent rather than guessing
- suggestedQuestions should be actionable questions an adjuster would send to the contractor

Return ONLY valid JSON with this exact shape:
{
  "recommendation": "approve" | "query-contractor" | "escalate",
  "findings": [{ "code": string, "description": string, "severity": "info" | "warning" | "critical" }],
  "clauseCompliance": [{ "citation": string, "status": "compliant" | "non-compliant" | "not-applicable", "note": string }],
  "anomalies": [string],
  "costReasonableness": "within-range" | "high" | "low",
  "suggestedQuestions": [string]
}`;

// ── Signal collection ─────────────────────────────────────────────────────────

async function collectSignals(inspectionId: string) {
  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      id: true,
      inspectionNumber: true,
      propertyAddress: true,
      propertyPostcode: true,
      status: true,
      inspectionDate: true,
      makeSafeActions: {
        select: { action: true, applicable: true, completed: true },
        take: 20,
      },
      scopeVariations: {
        select: {
          id: true,
          reason: true,
          costDeltaCents: true,
          costDeltaPercent: true,
          status: true,
          autoApprovalRule: true,
          authorisationSource: true,
          authorisationRef: true,
        },
        take: 50,
      },
      moistureReadings: {
        select: {
          location: true,
          moistureLevel: true,
          surfaceType: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
        take: 100,
      },
      costEstimates: {
        select: { category: true, description: true, subtotal: true },
        take: 100,
      },
    },
  });

  return inspection;
}

// ── Anomaly detection (pure, no AI) ──────────────────────────────────────────

function detectAnomalies(
  inspection: NonNullable<Awaited<ReturnType<typeof collectSignals>>>,
) {
  const anomalies: string[] = [];

  // Make-safe completeness check (ICA Code of Practice §6)
  const incompleteHazards = inspection.makeSafeActions.filter(
    (a) => a.applicable && !a.completed,
  );
  if (incompleteHazards.length > 0) {
    anomalies.push(
      `${incompleteHazards.length} incomplete stabilisation action(s): ${incompleteHazards.map((a) => a.action).join(", ")} (ICA Code of Practice §6)`,
    );
  }

  // Variation anomalies
  const pendingVariations = inspection.scopeVariations.filter(
    (v) => v.status === "PENDING",
  );
  if (pendingVariations.length > 0) {
    anomalies.push(
      `${pendingVariations.length} scope variation(s) awaiting approval`,
    );
  }

  const largeVariations = inspection.scopeVariations.filter(
    (v) => Math.abs(v.costDeltaPercent ?? 0) > 25,
  );
  if (largeVariations.length > 0) {
    anomalies.push(
      `${largeVariations.length} variation(s) exceed ±25% cost delta — escalation threshold`,
    );
  }

  // Moisture trend (ascending = anomaly)
  if (inspection.moistureReadings.length >= 4) {
    const recent = inspection.moistureReadings.slice(-4);
    const avgRecent =
      recent.reduce((s, r) => s + r.moistureLevel, 0) / recent.length;
    const avgEarly =
      inspection.moistureReadings
        .slice(0, 4)
        .reduce((s, r) => s + r.moistureLevel, 0) / 4;
    if (avgRecent > avgEarly * 1.05) {
      anomalies.push(
        "Moisture readings show ascending trend — drying not progressing (AS-IICRC S500:2025 §7.1)",
      );
    }
  }

  return anomalies;
}

// ── User prompt builder ───────────────────────────────────────────────────────

function buildUserPrompt(
  inspection: NonNullable<Awaited<ReturnType<typeof collectSignals>>>,
  anomalies: string[],
): string {
  const totalCostCents = inspection.costEstimates.reduce(
    (s, e) => s + e.subtotal * 100,
    0,
  );
  const variationNetCents = inspection.scopeVariations.reduce(
    (s, v) => s + v.costDeltaCents,
    0,
  );

  const makeSafeComplete = inspection.makeSafeActions.every(
    (a) => !a.applicable || a.completed,
  );

  return `CLAIM AUDIT REQUEST
Inspection: ${inspection.inspectionNumber}
Address: ${inspection.propertyAddress} (postcode: ${inspection.propertyPostcode})
Status: ${inspection.status}
Date: ${inspection.inspectionDate.toISOString().split("T")[0]}

MAKE-SAFE / STABILISATION (ICA Code of Practice §6)
Complete: ${makeSafeComplete ? "YES" : "NO"}
Actions: ${JSON.stringify(inspection.makeSafeActions)}

SCOPE VARIATIONS
Count: ${inspection.scopeVariations.length}
Net delta: ${(variationNetCents / 100).toFixed(2)} AUD
Details: ${JSON.stringify(inspection.scopeVariations)}

MOISTURE READINGS (AS-IICRC S500:2025 §7.1)
Count: ${inspection.moistureReadings.length}
Readings: ${JSON.stringify(inspection.moistureReadings.slice(-20))}

COST ESTIMATES
Total (cents): ${totalCostCents}
Items: ${JSON.stringify(inspection.costEstimates.slice(0, 30))}

PRE-COMPUTED ANOMALIES
${anomalies.length > 0 ? anomalies.join("\n") : "None detected"}

Produce the structured audit JSON now.`;
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Run the adjuster AI agent for a given inspection.
 *
 * Collects compliance signals, detects rule-based anomalies, calls AI for
 * structured recommendation, and returns a zod-validated AdjusterRecommendation.
 *
 * Does NOT persist AI output — caller is responsible for any storage.
 */
export async function runAdjusterAgent(
  inspectionId: string,
): Promise<AdjusterRecommendation> {
  const inspection = await collectSignals(inspectionId);

  if (!inspection) {
    throw new Error(`Inspection not found: ${inspectionId}`);
  }

  const anomalies = detectAnomalies(inspection);
  const userPrompt = buildUserPrompt(inspection, anomalies);

  const aiResponse = await restoreAssistAiDispatch({
    systemPrompt: ADJUSTER_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.1,
    maxTokens: 2048,
  });

  // Parse and validate AI output
  let parsed: unknown;
  try {
    // Strip markdown code fences if present
    const raw = aiResponse.text
      .replace(/^```(?:json)?\n?/m, "")
      .replace(/\n?```$/m, "")
      .trim();
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Adjuster AI returned non-JSON response");
  }

  const result = AdjusterRecommendationSchema.parse({
    ...(parsed as object),
    inspectionId,
    generatedAt: new Date().toISOString(),
  });

  return result;
}
