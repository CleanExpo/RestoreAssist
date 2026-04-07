/**
 * BYOK Vision Client — server-side multimodal image analysis
 *
 * Dispatches vision requests to whichever BYOK provider the user has connected:
 *   Claude (claude-opus-4-6, claude-sonnet-4-6)  — Anthropic vision API
 *   Gemini (gemini-3.1-pro, gemini-3.1-flash)    — Google multimodal API
 *   GPT (gpt-5.4, gpt-5.4-mini)                  — OpenAI vision API
 *
 * All output is structured as IICRC S500:2025-compliant analysis results that
 * populate inspection evidence fields automatically.
 *
 * RA-393: Phase 0.5 — BYOK Vision Extension
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import { getLatestAIIntegration } from "@/lib/ai-provider";
import {
  BYOK_ALLOWED_MODELS,
  type AllowedModel,
} from "@/mobile/constants/byok";

// ─── Evidence & damage taxonomy (IICRC S500:2025) ────────────────────────────

export const EVIDENCE_CLASSES = [
  "SITE_OVERVIEW",
  "DAMAGE_CLOSE_UP",
  "MOISTURE_READING",
  "THERMAL_IMAGE",
  "EQUIPMENT_PLACEMENT",
  "CONTAINMENT_SETUP",
  "AIR_QUALITY_READING",
  "MATERIAL_SAMPLE",
  "FLOOR_PLAN_ANNOTATION",
  "PROGRESS_PHOTO",
  "COMPLETION_PHOTO",
  "AFFECTED_CONTENTS",
  "STRUCTURAL_ASSESSMENT",
  "SAFETY_HAZARD",
  "UTILITY_STATUS",
  "ENVIRONMENTAL_CONDITION",
  "OTHER",
] as const;

export type EvidenceClass = (typeof EVIDENCE_CLASSES)[number];

export const DAMAGE_CATEGORIES = [
  "Category 1", // Clean water source
  "Category 2", // Significantly contaminated
  "Category 3", // Grossly contaminated
] as const;

export const DAMAGE_CLASSES = [
  "Class 1", // Least amount of water — minimal absorption
  "Class 2", // Large amount of water — significant absorption
  "Class 3", // Greatest amount of water — ceilings/walls affected
  "Class 4", // Specialty drying — low porosity materials
] as const;

export type DamageCategory = (typeof DAMAGE_CATEGORIES)[number];
export type DamageClass = (typeof DAMAGE_CLASSES)[number];

// ─── Vision request / response types ─────────────────────────────────────────

export interface VisionAnalysisRequest {
  /** Base64-encoded image data (without data: URI prefix) */
  imageBase64: string;
  /** MIME type of the image */
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  /** Extra context — room name, inspection stage, prior notes */
  context?: string;
  /** Override the model to use (must be in BYOK allowlist) */
  modelOverride?: AllowedModel;
  /** User ID — used to look up their BYOK integration */
  userId: string;
}

/** IICRC S500:2025-compliant structured vision output */
export interface S500VisionResult {
  /** Best-fit IICRC S500 damage category (1–3) */
  damageCategory: DamageCategory | null;
  /** IICRC S500 water damage class (1–4) */
  damageClass: DamageClass | null;
  /** Plain-English description of affected area */
  affectedArea: string;
  /** Visible moisture indicators (e.g. staining, efflorescence, cupping) */
  moistureIndicators: string[];
  /** Suggested evidence class from the RestoreAssist taxonomy */
  suggestedEvidenceClass: EvidenceClass;
  /** Safety hazards visible in the image */
  safetyHazards: string[];
  /** Structural concerns (e.g. compromised load-bearing members) */
  structuralConcerns: string[];
  /** Detected building materials (drywall, hardwood, subfloor, etc.) */
  materials: string[];
  /** Overall photo quality score 0–100 */
  photoQualityScore: number;
  /** Section 7 compliance notes */
  s500ComplianceNotes: string;
  /** Free-text description of the image */
  rawDescription: string;
  /** Confidence in the analysis, 0–1 */
  confidence: number;
  /** Model that produced this result */
  model: string;
  /** Provider used */
  provider: "anthropic" | "openai" | "gemini";
}

// ─── System prompt ────────────────────────────────────────────────────────────

const S500_SYSTEM_PROMPT = `You are an IICRC-certified water damage restoration expert analysing site photographs for an Australian insurance inspection. Apply IICRC S500:2025 standards to every analysis.

Respond ONLY with a valid JSON object matching this exact schema:
{
  "damageCategory": "Category 1" | "Category 2" | "Category 3" | null,
  "damageClass": "Class 1" | "Class 2" | "Class 3" | "Class 4" | null,
  "affectedArea": string,
  "moistureIndicators": string[],
  "suggestedEvidenceClass": one of [SITE_OVERVIEW, DAMAGE_CLOSE_UP, MOISTURE_READING, THERMAL_IMAGE, EQUIPMENT_PLACEMENT, CONTAINMENT_SETUP, AIR_QUALITY_READING, MATERIAL_SAMPLE, FLOOR_PLAN_ANNOTATION, PROGRESS_PHOTO, COMPLETION_PHOTO, AFFECTED_CONTENTS, STRUCTURAL_ASSESSMENT, SAFETY_HAZARD, UTILITY_STATUS, ENVIRONMENTAL_CONDITION, OTHER],
  "safetyHazards": string[],
  "structuralConcerns": string[],
  "materials": string[],
  "photoQualityScore": number (0-100),
  "s500ComplianceNotes": string,
  "rawDescription": string,
  "confidence": number (0-1)
}

Rules:
- If water source is not visible or ambiguous, set damageCategory to null
- photoQualityScore: 100 = well-lit, sharp, full coverage; deduct for blur, backlight, partial framing
- s500ComplianceNotes: cite specific S500:2025 section numbers (e.g. §7.1, §9.3)
- Be concise and factual — this is a legal document`;

// ─── Provider dispatch ────────────────────────────────────────────────────────

/**
 * Analyse an image using the user's connected BYOK provider.
 * Falls back through providers in order: Anthropic → OpenAI → Gemini.
 */
export async function analyseImageWithBYOK(
  request: VisionAnalysisRequest,
): Promise<S500VisionResult> {
  const integration = await getLatestAIIntegration(request.userId);
  if (!integration) {
    throw new Error(
      "No AI provider connected. Add an API key in Settings → Integrations.",
    );
  }

  const dataUri = `data:${request.mimeType};base64,${request.imageBase64}`;
  const contextNote = request.context
    ? `\n\nContext from technician: ${request.context}`
    : "";

  let rawJson: string;
  let model: string;
  let provider: S500VisionResult["provider"];

  switch (integration.provider) {
    case "anthropic": {
      ({ rawJson, model } = await callAnthropicVision(
        integration.apiKey,
        request.imageBase64,
        request.mimeType,
        contextNote,
        request.modelOverride,
      ));
      provider = "anthropic";
      break;
    }
    case "openai": {
      ({ rawJson, model } = await callOpenAIVision(
        integration.apiKey,
        dataUri,
        contextNote,
        request.modelOverride,
      ));
      provider = "openai";
      break;
    }
    case "gemini": {
      ({ rawJson, model } = await callGeminiVision(
        integration.apiKey,
        request.imageBase64,
        request.mimeType,
        contextNote,
        request.modelOverride,
      ));
      provider = "gemini";
      break;
    }
    default:
      throw new Error(`Unsupported provider: ${integration.provider}`);
  }

  return parseS500Result(rawJson, model, provider);
}

// ─── Claude vision ────────────────────────────────────────────────────────────

async function callAnthropicVision(
  apiKey: string,
  imageBase64: string,
  mimeType: VisionAnalysisRequest["mimeType"],
  contextNote: string,
  modelOverride?: AllowedModel,
): Promise<{ rawJson: string; model: string }> {
  const anthropic = new Anthropic({ apiKey });

  const claudeModel =
    modelOverride === "claude-opus-4-6"
      ? "claude-opus-4-6"
      : "claude-sonnet-4-6";

  const response = await anthropic.messages.create({
    model: claudeModel,
    max_tokens: 1024,
    system: S500_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType,
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: `Analyse this water damage site photograph using IICRC S500:2025 standards.${contextNote}`,
          },
        ],
      },
    ],
  });

  const text =
    response.content[0]?.type === "text" ? response.content[0].text : "";
  return { rawJson: text, model: claudeModel };
}

// ─── OpenAI vision ────────────────────────────────────────────────────────────

async function callOpenAIVision(
  apiKey: string,
  dataUri: string,
  contextNote: string,
  modelOverride?: AllowedModel,
): Promise<{ rawJson: string; model: string }> {
  const openai = new OpenAI({ apiKey });

  const gptModel =
    modelOverride === "gpt-5.4-mini" ? "gpt-5.4-mini" : "gpt-5.4";

  const response = await openai.chat.completions.create({
    model: gptModel,
    max_tokens: 1024,
    messages: [
      {
        role: "system",
        content: S500_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: dataUri, detail: "high" },
          },
          {
            type: "text",
            text: `Analyse this water damage site photograph using IICRC S500:2025 standards.${contextNote}`,
          },
        ],
      },
    ],
    response_format: { type: "json_object" },
  });

  const text = response.choices[0]?.message?.content ?? "";
  return { rawJson: text, model: gptModel };
}

// ─── Gemini vision ────────────────────────────────────────────────────────────

async function callGeminiVision(
  apiKey: string,
  imageBase64: string,
  mimeType: VisionAnalysisRequest["mimeType"],
  contextNote: string,
  modelOverride?: AllowedModel,
): Promise<{ rawJson: string; model: string }> {
  const genAI = new GoogleGenerativeAI(apiKey);

  const geminiModel =
    modelOverride === "gemini-3.1-flash"
      ? "gemini-3.1-flash"
      : "gemini-3.1-pro";

  const model = genAI.getGenerativeModel({
    model: geminiModel,
    systemInstruction: S500_SYSTEM_PROMPT,
  });

  const imagePart: Part = {
    inlineData: {
      mimeType,
      data: imageBase64,
    },
  };

  const result = await model.generateContent([
    imagePart,
    `Analyse this water damage site photograph using IICRC S500:2025 standards.${contextNote}`,
  ]);

  const text = result.response.text();
  return { rawJson: text, model: geminiModel };
}

// ─── Result parser ────────────────────────────────────────────────────────────

function parseS500Result(
  rawJson: string,
  model: string,
  provider: S500VisionResult["provider"],
): S500VisionResult {
  // Strip markdown code fences if present
  const clean = rawJson
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "")
    .trim();

  let parsed: Partial<S500VisionResult>;
  try {
    parsed = JSON.parse(clean);
  } catch {
    // Fallback when model returns non-JSON despite instructions
    return {
      damageCategory: null,
      damageClass: null,
      affectedArea: "Unable to parse — check raw description",
      moistureIndicators: [],
      suggestedEvidenceClass: "SITE_OVERVIEW",
      safetyHazards: [],
      structuralConcerns: [],
      materials: [],
      photoQualityScore: 0,
      s500ComplianceNotes: "Parse error — manual review required",
      rawDescription: rawJson.slice(0, 500),
      confidence: 0,
      model,
      provider,
    };
  }

  return {
    damageCategory: parsed.damageCategory ?? null,
    damageClass: parsed.damageClass ?? null,
    affectedArea: parsed.affectedArea ?? "",
    moistureIndicators: parsed.moistureIndicators ?? [],
    suggestedEvidenceClass: parsed.suggestedEvidenceClass ?? "SITE_OVERVIEW",
    safetyHazards: parsed.safetyHazards ?? [],
    structuralConcerns: parsed.structuralConcerns ?? [],
    materials: parsed.materials ?? [],
    photoQualityScore: parsed.photoQualityScore ?? 0,
    s500ComplianceNotes: parsed.s500ComplianceNotes ?? "",
    rawDescription: parsed.rawDescription ?? "",
    confidence: parsed.confidence ?? 0.5,
    model,
    provider,
  };
}
