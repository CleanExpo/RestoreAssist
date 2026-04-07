/**
 * RestoreAssist Scope Narrative Prompts
 *
 * System prompt and user message builder for the Claude API scope generation endpoint.
 * Brand voice from RA-257 (RestoreAssist ClientProfile).
 *
 * System prompt is designed for Anthropic prompt caching:
 * mark with cache_control: { type: "ephemeral" } for ~90% token savings on repeat calls.
 */

// ============================================================
// System Prompt (RestoreAssist ClientProfile — RA-257)
// ============================================================

export const SCOPE_SYSTEM_PROMPT = `You are RestoreAssist's scope generation engine. You produce professional Australian restoration scope-of-works documents for insurance claims.

IDENTITY
RestoreAssist is Australian-built software for water, fire, and mould restoration professionals. It speaks the language of IICRC-certified practitioners, not general contractors or builders.

BRAND VOICE
precise · practitioner-grade · compliant · field-tested · IICRC-aligned

WRITING RULES
1. Every task line must cite its IICRC standard reference (e.g. "IICRC S500:2021 §9.3.2").
2. Quantities must be specific — never write "adequate" or "appropriate". Write "2 air movers" or "1 LGR dehumidifier".
3. Active voice. Short sentences. No waffle.
4. Audience: insurance assessors and IICRC-certified technicians. Assume they know the standards.
5. Never use hedging language ("may", "might", "could potentially") unless genuinely uncertain.
6. Numbers in scope items are justified by IICRC ratios, not technician judgement.

ANTI-PATTERNS — NEVER USE THESE
- "Revolutionary", "cutting-edge", "world-class", "seamless"
- "Transform your business" / "game-changing"
- "Best-in-class", "state-of-the-art"
- "We leverage synergies"
- "Comprehensive solution"

SCOPE FORMAT RULES
Always produce the scope in exactly 7 numbered sections:
1. Loss Source Identification & Stoppage
2. Initial Extraction & Content Protection
3. Structural Drying Setup
4. Daily Monitoring Protocol
5. Antimicrobial Treatment (include for Cat 2/3; omit for Cat 1 with note)
6. Drying Validation & Signoff
7. Reinstatement Recommendations

Each section must include:
- Specific tasks with quantities
- IICRC S500:2021 section reference
- Any AS/NZS standard references where applicable (e.g. AS/NZS 3012:2019 for electrical)

OUTPUT: Professional business document. Markdown formatting acceptable (bold headings, bullet lists for tasks).`;

// ============================================================
// Types for user message construction
// ============================================================

export interface MoistureReadingInput {
  location: string;
  surfaceType: string;
  moistureLevel: number;
  target: number;
  status: "DRY" | "DRYING" | "WET";
}

export interface EquipmentItemInput {
  label: string;
  quantity: number;
  iicrcReference: string;
  justification: string;
  estimatedAmpsTotal: number;
}

export interface EnvironmentalInput {
  temperature?: number;
  humidity?: number;
  gpp?: number;
  dewPoint?: number;
  location?: string;
}

export interface ScopeNarrativeInput {
  propertyAddress: string;
  inspectionDate: string;
  damageCategory: string; // "CAT_1" | "CAT_2" | "CAT_3"
  damageClass: string; // "CLASS_1" | "CLASS_2" | "CLASS_3" | "CLASS_4"
  lossSourceIdentified: boolean;
  lossSourceDescription?: string;
  affectedAreaM2: number;
  affectedRooms?: string[];
  moistureReadings: MoistureReadingInput[];
  environmentalData?: EnvironmentalInput;
  equipment: EquipmentItemInput[];
  totalEstimatedAmps: number;
  circuitLoadWarning?: string;
  notes?: string;
}

// ============================================================
// User Message Builder
// ============================================================

function formatCategory(cat: string): string {
  const num = cat.replace("CAT_", "");
  const labels: Record<string, string> = {
    "1": "1 (Clean Water)",
    "2": "2 (Grey Water — limited contamination)",
    "3": "3 (Black Water — significant contamination)",
  };
  return `Category ${labels[num] ?? num}`;
}

function formatClass(cls: string): string {
  const num = cls.replace("CLASS_", "");
  const labels: Record<string, string> = {
    "1": "1 (Limited — minimal moisture absorption)",
    "2": "2 (Significant — moderate absorption)",
    "3": "3 (Extensive — saturated materials)",
    "4": "4 (Specialty — low permeance materials)",
  };
  return `Class ${labels[num] ?? num}`;
}

export function buildScopeUserMessage(input: ScopeNarrativeInput): string {
  const {
    propertyAddress,
    inspectionDate,
    damageCategory,
    damageClass,
    lossSourceIdentified,
    lossSourceDescription,
    affectedAreaM2,
    affectedRooms,
    moistureReadings,
    environmentalData,
    equipment,
    totalEstimatedAmps,
    circuitLoadWarning,
    notes,
  } = input;

  const lines: string[] = [];

  lines.push(
    `Generate a scope of works for the following water damage inspection:`,
  );
  lines.push(``);
  lines.push(`**Property:** ${propertyAddress}`);
  lines.push(
    `**Inspection Date:** ${new Date(inspectionDate).toLocaleDateString("en-AU")}`,
  );
  lines.push(
    `**IICRC Classification:** ${formatCategory(damageCategory)} · ${formatClass(damageClass)}`,
  );
  lines.push(
    `**Loss Source:** ${lossSourceIdentified ? (lossSourceDescription ?? "Identified and addressed") : "⚠️ NOT YET IDENTIFIED — include in scope"}`,
  );
  lines.push(`**Total Affected Area:** ${affectedAreaM2.toFixed(1)}m²`);

  if (affectedRooms && affectedRooms.length > 0) {
    lines.push(`**Affected Rooms:** ${affectedRooms.join(", ")}`);
  }

  if (environmentalData) {
    lines.push(``);
    lines.push(`**Environmental Conditions:**`);
    if (environmentalData.temperature !== undefined)
      lines.push(`- Dry Bulb Temperature: ${environmentalData.temperature}°C`);
    if (environmentalData.humidity !== undefined)
      lines.push(`- Relative Humidity: ${environmentalData.humidity}%`);
    if (environmentalData.gpp !== undefined)
      lines.push(
        `- Grains Per Pound (GPP): ${environmentalData.gpp.toFixed(1)}`,
      );
    if (environmentalData.dewPoint !== undefined)
      lines.push(`- Dew Point: ${environmentalData.dewPoint.toFixed(1)}°C`);
    if (environmentalData.location)
      lines.push(`- Measured at: ${environmentalData.location}`);
  }

  if (equipment.length > 0) {
    lines.push(``);
    lines.push(`**Equipment Required (IICRC S500 ratios):**`);
    for (const eq of equipment) {
      lines.push(
        `- ${eq.quantity}× ${eq.label}: ${eq.justification} (${eq.iicrcReference}) — ${eq.estimatedAmpsTotal.toFixed(1)}A`,
      );
    }
    lines.push(
      `- Total estimated electrical load: ${totalEstimatedAmps.toFixed(1)}A`,
    );
    if (circuitLoadWarning) {
      lines.push(`- ⚠️ Circuit warning: ${circuitLoadWarning}`);
    }
  }

  if (moistureReadings.length > 0) {
    lines.push(``);
    lines.push(`**Moisture Readings:**`);
    for (const r of moistureReadings) {
      const statusEmoji =
        r.status === "DRY" ? "✅" : r.status === "DRYING" ? "🟡" : "🔴";
      lines.push(
        `- ${r.location} (${r.surfaceType}): ${r.moistureLevel}% [target ≤${r.target}%] ${statusEmoji} ${r.status}`,
      );
    }
    const wetCount = moistureReadings.filter((r) => r.status === "WET").length;
    const dryingCount = moistureReadings.filter(
      (r) => r.status === "DRYING",
    ).length;
    lines.push(
      `- Summary: ${wetCount} WET · ${dryingCount} DRYING · ${moistureReadings.length - wetCount - dryingCount} DRY`,
    );
  }

  if (notes?.trim()) {
    lines.push(``);
    lines.push(`**Technician Notes:**`);
    lines.push(notes.trim());
  }

  lines.push(``);
  lines.push(
    `Generate the complete scope of works in the required 7-section format. Be specific with quantities and IICRC references throughout.`,
  );

  return lines.join("\n");
}
