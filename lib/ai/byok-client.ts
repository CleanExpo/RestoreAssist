/**
 * [RA-393] BYOK Vision Client — Phase 0.5
 * Multi-provider AI dispatch with image/video vision input.
 * Supports Claude, Gemini, and GPT vision endpoints.
 * S500:2025 structured output parsing for inspection intelligence.
 *
 * BYOK allowlist is IMMUTABLE — defined in mobile/constants/byok.ts
 * and mirrored here. Do NOT modify the allowlist.
 */

import Anthropic from "@anthropic-ai/sdk";

// ═══ BYOK Allowlist (mirror of mobile/constants/byok.ts) ═══════════

export const BYOK_ALLOWED_MODELS = [
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "gemini-3.1-pro",
  "gemini-3.1-flash",
  "gpt-5.4",
  "gpt-5.4-mini",
] as const;

export type AllowedModel = (typeof BYOK_ALLOWED_MODELS)[number];

/** Provider families derived from model names */
export type ProviderFamily = "anthropic" | "google" | "openai";

// ═══ Provider Detection ═════════════════════════════════════════════

function getProviderFamily(model: AllowedModel): ProviderFamily {
  if (model.startsWith("claude-")) return "anthropic";
  if (model.startsWith("gemini-")) return "google";
  if (model.startsWith("gpt-")) return "openai";
  throw new Error(`Unknown provider for model: ${model}`);
}

function isAllowedModel(model: string): model is AllowedModel {
  return (BYOK_ALLOWED_MODELS as readonly string[]).includes(model);
}

// ═══ Types ══════════════════════════════════════════════════════════

/** Supported media types for vision input */
export type VisionMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif"
  | "video/mp4";

/** A single vision input — base64-encoded image or video */
export interface VisionInput {
  /** Base64-encoded media data (without data URI prefix) */
  data: string;
  /** MIME type of the media */
  mediaType: VisionMediaType;
  /** Optional label for the image (used in structured output) */
  label?: string;
}

/** Request payload for the BYOK client */
export interface ByokRequest {
  /** The model to use — must be in BYOK_ALLOWED_MODELS */
  model: AllowedModel;
  /** The user's API key for the provider */
  apiKey: string;
  /** System prompt (instructions, persona, format) */
  systemPrompt: string;
  /** User text prompt */
  userPrompt: string;
  /** Optional vision inputs — images or video frames */
  visionInputs?: VisionInput[];
  /** Temperature (0.0 - 1.0). Default 0.3 for structured output */
  temperature?: number;
  /** Max output tokens. Default 4096 */
  maxTokens?: number;
  /** Request timeout in ms. Default 60000 */
  timeoutMs?: number;
}

/** Standard response from any provider */
export interface ByokResponse {
  /** The generated text response */
  text: string;
  /** Model that generated the response */
  model: AllowedModel;
  /** Provider family */
  provider: ProviderFamily;
  /** Token usage if available */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  /** Request duration in ms */
  durationMs: number;
}

/** S500:2025 structured output — parsed from AI response */
export interface S500StructuredOutput {
  /** Water damage category (1, 2, or 3) per S500 §3 */
  waterCategory?: 1 | 2 | 3;
  /** Damage class (1-4) per S500 §7.1 */
  damageClass?: 1 | 2 | 3 | 4;
  /** Identified materials and their conditions */
  materials?: Array<{
    name: string;
    condition: "wet" | "damp" | "dry" | "saturated";
    location?: string;
    s500Ref?: string;
  }>;
  /** Identified equipment in photos */
  equipment?: Array<{
    type: string;
    brand?: string;
    serialNumber?: string;
    location?: string;
  }>;
  /** Damage observations from photos */
  damageObservations?: Array<{
    description: string;
    severity: "minor" | "moderate" | "severe" | "critical";
    location?: string;
    s500Ref?: string;
  }>;
  /** Moisture reading interpretations */
  moistureReadings?: Array<{
    material: string;
    value: number;
    unit: string;
    interpretation: string;
    aboveThreshold: boolean;
  }>;
  /** Overall assessment text */
  summary?: string;
  /** Confidence score (0-1) for the analysis */
  confidence?: number;
}

// ═══ Provider-Specific Formatters ═══════════════════════════════════

/**
 * Format vision inputs for Anthropic Claude API.
 * Claude accepts image/* as base64 blocks. video/mp4 is not supported
 * as base64 input — video frames must be sent as individual images.
 */
function formatClaudeMessages(
  userPrompt: string,
  visionInputs?: VisionInput[],
): Anthropic.MessageParam[] {
  const content: Anthropic.ContentBlockParam[] = [];

  if (visionInputs?.length) {
    for (const input of visionInputs) {
      // Skip video/mp4 — Anthropic only accepts image media types as base64
      if (input.mediaType === "video/mp4") continue;

      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: input.mediaType as Anthropic.Base64ImageSource["media_type"],
          data: input.data,
        },
      });
    }
  }

  content.push({ type: "text", text: userPrompt });

  return [{ role: "user", content }];
}

/**
 * Format vision inputs for Google Gemini API.
 * Gemini uses inlineData with mimeType and data.
 */
function formatGeminiContents(
  userPrompt: string,
  visionInputs?: VisionInput[],
): Array<Record<string, unknown>> {
  const parts: Array<Record<string, unknown>> = [];

  if (visionInputs?.length) {
    for (const input of visionInputs) {
      parts.push({
        inlineData: {
          mimeType: input.mediaType,
          data: input.data,
        },
      });
    }
  }

  parts.push({ text: userPrompt });

  return [{ role: "user", parts }];
}

/**
 * Format vision inputs for OpenAI GPT API.
 * GPT uses content array with image_url type containing base64 data URIs.
 */
function formatGptMessages(
  systemPrompt: string,
  userPrompt: string,
  visionInputs?: VisionInput[],
): Array<Record<string, unknown>> {
  const userContent: Array<Record<string, unknown>> = [];

  if (visionInputs?.length) {
    for (const input of visionInputs) {
      userContent.push({
        type: "image_url",
        image_url: {
          url: `data:${input.mediaType};base64,${input.data}`,
          detail: "high",
        },
      });
    }
  }

  userContent.push({ type: "text", text: userPrompt });

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];
}

// ═══ Provider Dispatch ══════════════════════════════════════════════

// RA-1065: Replaced raw fetch + hardcoded anthropic-version header with
// @anthropic-ai/sdk. Benefits: auto-retry on 429/529, type-safe response
// objects, SDK-managed versioning, streaming-ready for future extension.
async function callAnthropic(req: ByokRequest): Promise<ByokResponse> {
  const start = Date.now();

  const client = new Anthropic({
    apiKey: req.apiKey,
    timeout: req.timeoutMs ?? 60000,
    maxRetries: 2, // Auto-retry on rate limit (429) and overload (529)
  });

  const response = await client.messages.create({
    model: req.model,
    max_tokens: req.maxTokens ?? 4096,
    temperature: req.temperature ?? 0.3,
    system: req.systemPrompt,
    messages: formatClaudeMessages(req.userPrompt, req.visionInputs),
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  return {
    text,
    model: req.model,
    provider: "anthropic",
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
    durationMs: Date.now() - start,
  };
}

async function callGoogle(req: ByokRequest): Promise<ByokResponse> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), req.timeoutMs ?? 60000);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${req.model}:generateContent?key=${req.apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: formatGeminiContents(req.userPrompt, req.visionInputs),
        systemInstruction: { parts: [{ text: req.systemPrompt }] },
        generationConfig: {
          temperature: req.temperature ?? 0.3,
          maxOutputTokens: req.maxTokens ?? 4096,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`Gemini API ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const json = await res.json();
    const text =
      json.candidates?.[0]?.content?.parts
        ?.map((p: Record<string, unknown>) => p.text ?? "")
        .join("") ?? "";

    const usageMeta = json.usageMetadata;

    return {
      text,
      model: req.model,
      provider: "google",
      usage: usageMeta
        ? {
            inputTokens: usageMeta.promptTokenCount ?? 0,
            outputTokens: usageMeta.candidatesTokenCount ?? 0,
          }
        : undefined,
      durationMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function callOpenAI(req: ByokRequest): Promise<ByokResponse> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), req.timeoutMs ?? 60000);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${req.apiKey}`,
      },
      body: JSON.stringify({
        model: req.model,
        messages: formatGptMessages(
          req.systemPrompt,
          req.userPrompt,
          req.visionInputs,
        ),
        temperature: req.temperature ?? 0.3,
        max_tokens: req.maxTokens ?? 4096,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`OpenAI API ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const json = await res.json();
    const text = json.choices?.[0]?.message?.content ?? "";

    return {
      text,
      model: req.model,
      provider: "openai",
      usage: json.usage
        ? {
            inputTokens: json.usage.prompt_tokens,
            outputTokens: json.usage.completion_tokens,
          }
        : undefined,
      durationMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ═══ S500:2025 Structured Output Parser ═════════════════════════════

/**
 * Parse AI response text into S500:2025 structured output.
 * Expects JSON response from AI — falls back to partial extraction.
 */
export function parseS500Output(text: string): S500StructuredOutput | null {
  // Try direct JSON parse first (AI was prompted to return JSON)
  const jsonMatch =
    text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const raw = JSON.parse(jsonMatch[1] ?? jsonMatch[0]);
      return validateS500Output(raw);
    } catch {
      // Fall through to partial extraction
    }
  }

  return null;
}

function validateS500Output(
  raw: Record<string, unknown>,
): S500StructuredOutput {
  const output: S500StructuredOutput = {};

  // Water category validation
  if (
    typeof raw.waterCategory === "number" &&
    [1, 2, 3].includes(raw.waterCategory)
  ) {
    output.waterCategory = raw.waterCategory as 1 | 2 | 3;
  }

  // Damage class validation
  if (
    typeof raw.damageClass === "number" &&
    [1, 2, 3, 4].includes(raw.damageClass)
  ) {
    output.damageClass = raw.damageClass as 1 | 2 | 3 | 4;
  }

  // Materials
  if (Array.isArray(raw.materials)) {
    output.materials = raw.materials
      .filter(
        (m: Record<string, unknown>) =>
          typeof m.name === "string" &&
          typeof m.condition === "string" &&
          ["wet", "damp", "dry", "saturated"].includes(m.condition as string),
      )
      .map((m: Record<string, unknown>) => ({
        name: m.name as string,
        condition: m.condition as "wet" | "damp" | "dry" | "saturated",
        location: typeof m.location === "string" ? m.location : undefined,
        s500Ref: typeof m.s500Ref === "string" ? m.s500Ref : undefined,
      }));
  }

  // Equipment
  if (Array.isArray(raw.equipment)) {
    output.equipment = raw.equipment
      .filter((e: Record<string, unknown>) => typeof e.type === "string")
      .map((e: Record<string, unknown>) => ({
        type: e.type as string,
        brand: typeof e.brand === "string" ? e.brand : undefined,
        serialNumber:
          typeof e.serialNumber === "string" ? e.serialNumber : undefined,
        location: typeof e.location === "string" ? e.location : undefined,
      }));
  }

  // Damage observations
  if (Array.isArray(raw.damageObservations)) {
    output.damageObservations = raw.damageObservations
      .filter(
        (d: Record<string, unknown>) =>
          typeof d.description === "string" &&
          typeof d.severity === "string" &&
          ["minor", "moderate", "severe", "critical"].includes(
            d.severity as string,
          ),
      )
      .map((d: Record<string, unknown>) => ({
        description: d.description as string,
        severity: d.severity as "minor" | "moderate" | "severe" | "critical",
        location: typeof d.location === "string" ? d.location : undefined,
        s500Ref: typeof d.s500Ref === "string" ? d.s500Ref : undefined,
      }));
  }

  // Moisture readings
  if (Array.isArray(raw.moistureReadings)) {
    output.moistureReadings = raw.moistureReadings
      .filter(
        (r: Record<string, unknown>) =>
          typeof r.material === "string" &&
          typeof r.value === "number" &&
          typeof r.unit === "string",
      )
      .map((r: Record<string, unknown>) => ({
        material: r.material as string,
        value: r.value as number,
        unit: r.unit as string,
        interpretation:
          typeof r.interpretation === "string" ? r.interpretation : "",
        aboveThreshold:
          typeof r.aboveThreshold === "boolean" ? r.aboveThreshold : false,
      }));
  }

  // Summary and confidence
  if (typeof raw.summary === "string") output.summary = raw.summary;
  if (
    typeof raw.confidence === "number" &&
    raw.confidence >= 0 &&
    raw.confidence <= 1
  ) {
    output.confidence = raw.confidence;
  }

  return output;
}

// ═══ S500:2025 Vision System Prompt ═════════════════════════════════

/** Default system prompt for S500:2025 inspection photo analysis */
export const S500_VISION_SYSTEM_PROMPT = `You are an IICRC S500:2025 certified water damage restoration inspector AI.
Analyze the provided inspection photos and return a JSON object with your findings.

IMPORTANT: Return ONLY valid JSON (no markdown, no explanation outside JSON).

Required JSON schema:
{
  "waterCategory": 1|2|3,          // S500 §3 water damage category
  "damageClass": 1|2|3|4,          // S500 §7.1 damage classification
  "materials": [{                   // Identified materials
    "name": "string",
    "condition": "wet"|"damp"|"dry"|"saturated",
    "location": "string",
    "s500Ref": "string"
  }],
  "equipment": [{                   // Visible equipment
    "type": "string",
    "brand": "string",
    "serialNumber": "string",
    "location": "string"
  }],
  "damageObservations": [{          // Damage findings
    "description": "string",
    "severity": "minor"|"moderate"|"severe"|"critical",
    "location": "string",
    "s500Ref": "string"
  }],
  "summary": "string",             // Brief assessment
  "confidence": 0.0-1.0            // Analysis confidence
}

Apply Australian restoration industry standards. Reference S500:2025 sections where applicable.
If you cannot determine a field with confidence, omit it rather than guessing.`;

// ═══ Public API ═════════════════════════════════════════════════════

/**
 * Dispatch a BYOK request to the appropriate provider.
 * Validates the model against the allowlist before dispatching.
 * Supports text-only and vision (image/video) requests.
 */
export async function byokDispatch(req: ByokRequest): Promise<ByokResponse> {
  if (!isAllowedModel(req.model)) {
    throw new Error(
      `Model "${req.model}" is not in the BYOK allowlist. Allowed: ${BYOK_ALLOWED_MODELS.join(", ")}`,
    );
  }

  if (!req.apiKey?.trim()) {
    throw new Error("API key is required for BYOK dispatch");
  }

  const provider = getProviderFamily(req.model);

  switch (provider) {
    case "anthropic":
      return callAnthropic(req);
    case "google":
      return callGoogle(req);
    case "openai":
      return callOpenAI(req);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

/**
 * Analyze inspection photos using vision AI with S500:2025 structured output.
 * Convenience wrapper around byokDispatch with the S500 system prompt.
 *
 * @param images - Base64-encoded inspection photos
 * @param model - BYOK model to use
 * @param apiKey - User's API key
 * @param additionalContext - Optional extra context (e.g., job type, room name)
 * @returns Structured S500 output and raw response
 */
export async function analyzeInspectionPhotos(
  images: VisionInput[],
  model: AllowedModel,
  apiKey: string,
  additionalContext?: string,
): Promise<{ structured: S500StructuredOutput | null; raw: ByokResponse }> {
  const userPrompt = additionalContext
    ? `Analyze these ${images.length} inspection photo(s). Additional context: ${additionalContext}`
    : `Analyze these ${images.length} inspection photo(s) for water damage assessment.`;

  const response = await byokDispatch({
    model,
    apiKey,
    systemPrompt: S500_VISION_SYSTEM_PROMPT,
    userPrompt,
    visionInputs: images,
    temperature: 0.2,
    maxTokens: 4096,
  });

  const structured = parseS500Output(response.text);

  return { structured, raw: response };
}

/**
 * Check if a model supports vision input.
 * All models in the current allowlist support vision.
 */
export function supportsVision(model: AllowedModel): boolean {
  // All current allowlist models have vision capabilities
  return true;
}

/**
 * Estimate cost for a vision request based on image count and model.
 * Returns estimated cost in USD. Used for usage metering.
 */
export function estimateVisionCost(
  model: AllowedModel,
  imageCount: number,
  estimatedOutputTokens: number = 2000,
): number {
  // Approximate per-image token costs (varies by resolution)
  const tokensPerImage = 1500;
  const inputTokens = imageCount * tokensPerImage + 500; // +500 for system/user prompt

  const rates: Record<ProviderFamily, { input: number; output: number }> = {
    anthropic: { input: 15.0 / 1_000_000, output: 75.0 / 1_000_000 }, // Claude Opus pricing
    google: { input: 1.25 / 1_000_000, output: 5.0 / 1_000_000 }, // Gemini Pro pricing
    openai: { input: 5.0 / 1_000_000, output: 15.0 / 1_000_000 }, // GPT-5.4 pricing
  };

  // Sonnet/Flash/Mini are cheaper
  const cheaperModels: AllowedModel[] = [
    "claude-sonnet-4-6",
    "gemini-3.1-flash",
    "gpt-5.4-mini",
  ];
  const provider = getProviderFamily(model);
  const rate = rates[provider];
  const discount = cheaperModels.includes(model) ? 0.2 : 1.0;

  return (
    (inputTokens * rate.input + estimatedOutputTokens * rate.output) * discount
  );
}
