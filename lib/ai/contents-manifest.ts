/**
 * [RA-405] Contents Manifest AI Draft
 * Vision-based contents identification from field photos.
 * Editable table output with confidence scoring.
 * CSV/XLSX export support.
 *
 * Premium AI task — routes through BYOK via model router.
 * Estimated compute: $0.02-0.15 per manifest vs $500-2,000 manual.
 *
 * BYOK allowlist is IMMUTABLE and NOT modified by this file.
 */

import type { VisionInput, AllowedModel } from "./byok-client";
import type { RouterConfig, RoutedAiResponse } from "./model-router";
import { routeAiRequest } from "./model-router";

// ━━━ Types ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Condition categories for affected contents */
export const CONTENTS_CONDITIONS = [
  "undamaged",
  "lightly_soiled",
  "water_damaged",
  "smoke_damaged",
  "fire_damaged",
  "mould_affected",
  "contaminated",
  "structurally_damaged",
  "destroyed",
] as const;

export type ContentsCondition = (typeof CONTENTS_CONDITIONS)[number];

/** Human-readable labels for conditions */
export const CONTENTS_CONDITION_LABELS: Record<ContentsCondition, string> = {
  undamaged: "Undamaged",
  lightly_soiled: "Lightly Soiled",
  water_damaged: "Water Damaged",
  smoke_damaged: "Smoke Damaged",
  fire_damaged: "Fire Damaged",
  mould_affected: "Mould Affected",
  contaminated: "Contaminated (Cat 2/3)",
  structurally_damaged: "Structurally Damaged",
  destroyed: "Destroyed / Non-Salvageable",
};

/** Restorability assessment for each item */
export type RestorabilityVerdict =
  | "restorable"
  | "questionable"
  | "non_restorable";

/** Item categories for insurance classification */
export const CONTENTS_CATEGORIES = [
  "furniture",
  "electronics",
  "appliances",
  "clothing_textiles",
  "documents_photos",
  "kitchenware",
  "artwork_decor",
  "personal_items",
  "toys_recreation",
  "tools_equipment",
  "musical_instruments",
  "sporting_goods",
  "jewellery_valuables",
  "books_media",
  "bathroom_items",
  "outdoor_garden",
  "other",
] as const;

export type ContentsCategory = (typeof CONTENTS_CATEGORIES)[number];

/** Human-readable labels for categories */
export const CONTENTS_CATEGORY_LABELS: Record<ContentsCategory, string> = {
  furniture: "Furniture",
  electronics: "Electronics",
  appliances: "Appliances",
  clothing_textiles: "Clothing & Textiles",
  documents_photos: "Documents & Photos",
  kitchenware: "Kitchenware",
  artwork_decor: "Artwork & Decor",
  personal_items: "Personal Items",
  toys_recreation: "Toys & Recreation",
  tools_equipment: "Tools & Equipment",
  musical_instruments: "Musical Instruments",
  sporting_goods: "Sporting Goods",
  jewellery_valuables: "Jewellery & Valuables",
  books_media: "Books & Media",
  bathroom_items: "Bathroom Items",
  outdoor_garden: "Outdoor & Garden",
  other: "Other",
};

/** A single item in the contents manifest */
export interface ContentsManifestItem {
  /** Unique item ID (uuid generated client-side for editing) */
  id: string;
  /** Item description as identified by AI */
  description: string;
  /** Category classification */
  category: ContentsCategory;
  /** Room or area where item was found */
  room: string;
  /** Current condition */
  condition: ContentsCondition;
  /** Restorability assessment */
  restorability: RestorabilityVerdict;
  /** Estimated replacement value in AUD (0 if unknown) */
  estimatedValueAud: number;
  /** Quantity identified */
  quantity: number;
  /** AI confidence score (0.0 - 1.0) */
  confidence: number;
  /** Which photo(s) this item was identified in (0-indexed) */
  sourcePhotoIndices: number[];
  /** Any notes from AI about this item */
  aiNotes?: string;
  /** Whether item has been manually verified by technician */
  verified: boolean;
  /** Manual override notes from technician */
  technicianNotes?: string;
}

/** The complete contents manifest */
export interface ContentsManifest {
  /** Inspection ID this manifest belongs to */
  inspectionId: string;
  /** All identified items */
  items: ContentsManifestItem[];
  /** Number of photos analysed */
  photosAnalysed: number;
  /** Total estimated replacement value in AUD */
  totalEstimatedValueAud: number;
  /** Overall AI confidence for the manifest (avg of items) */
  overallConfidence: number;
  /** Model that generated the manifest */
  model: string;
  /** Tier used (always "premium" for contents_manifest) */
  tier: "premium";
  /** Processing duration in ms */
  durationMs: number;
  /** Estimated AI cost in USD */
  estimatedCostUsd: number;
  /** Timestamp of generation */
  generatedAt: string;
  /** Summary notes from AI */
  summary?: string;
}

// ━━━ System Prompt ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** System prompt for contents manifest generation */
export const CONTENTS_MANIFEST_SYSTEM_PROMPT = `You are an Australian insurance restoration contents assessor AI.
Analyse the provided field photos and identify ALL visible contents (personal property, furniture, equipment, belongings).
For each item, assess its condition based on visible damage indicators.

IMPORTANT: Return ONLY valid JSON (no markdown, no explanation outside JSON).

Required JSON schema:
{
  "items": [
    {
      "description": "string — specific item description (e.g. 'Samsung 65-inch LED TV' not just 'TV')",
      "category": "furniture|electronics|appliances|clothing_textiles|documents_photos|kitchenware|artwork_decor|personal_items|toys_recreation|tools_equipment|musical_instruments|sporting_goods|jewellery_valuables|books_media|bathroom_items|outdoor_garden|other",
      "room": "string — room or area where visible (e.g. 'Master Bedroom', 'Kitchen', 'Living Room')",
      "condition": "undamaged|lightly_soiled|water_damaged|smoke_damaged|fire_damaged|mould_affected|contaminated|structurally_damaged|destroyed",
      "restorability": "restorable|questionable|non_restorable",
      "estimatedValueAud": number — estimated replacement value in AUD (0 if genuinely unknown),
      "quantity": number — how many of this item visible (minimum 1),
      "confidence": number — 0.0 to 1.0 confidence in identification and condition assessment,
      "sourcePhotoIndices": [number] — which photo(s) show this item (0-indexed),
      "aiNotes": "string — optional notes about damage pattern, brand identification, or assessment reasoning"
    }
  ],
  "summary": "string — brief overall summary of contents status and key observations"
}

RULES:
- Be SPECIFIC in descriptions. 'Ikea KALLAX 4x4 shelf unit' beats 'bookshelf'.
- Include ALL visible items, even partially obscured ones (note lower confidence).
- Australian pricing in AUD. Use current retail replacement values.
- Clothing/textiles: group by type unless individual high-value items are visible.
- Electronics: note brand/model if readable. If not, describe size/type.
- For water damage: note waterline indicators, swelling, discolouration.
- For smoke damage: note soot deposits, discolouration patterns.
- For mould: note visible growth locations and extent.
- Items in sealed containers/boxes: note as 'contents unknown' with lower confidence.
- Do NOT identify people in photos. Focus only on property/belongings.
- Minimum confidence 0.3 for inclusion. Below that, omit the item.`;

// ━━━ Manifest Generation ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Generate a contents manifest from field photos using vision AI.
 * Routes through the model router as a premium "contents_manifest" task.
 *
 * @param inspectionId - The inspection this manifest belongs to
 * @param photos - Base64-encoded field photos
 * @param config - Router config with BYOK model + API key
 * @param context - Optional context (job type, rooms, known damage)
 * @returns Complete ContentsManifest with all identified items
 */
export async function generateContentsManifest(
  inspectionId: string,
  photos: VisionInput[],
  config: RouterConfig,
  context?: {
    jobType?: string;
    rooms?: string[];
    knownDamageType?: string;
  },
): Promise<ContentsManifest> {
  if (!photos.length) {
    throw new Error("At least one photo is required for contents manifest");
  }

  if (photos.length > 20) {
    throw new Error("Maximum 20 photos per manifest generation");
  }

  // Build contextual user prompt
  let userPrompt = `Analyse these ${photos.length} inspection photo(s) and create a complete contents manifest.`;

  if (context?.jobType) {
    userPrompt += `\nJob type: ${context.jobType}`;
  }
  if (context?.rooms?.length) {
    userPrompt += `\nKnown rooms: ${context.rooms.join(", ")}`;
  }
  if (context?.knownDamageType) {
    userPrompt += `\nPrimary damage type: ${context.knownDamageType}`;
  }

  userPrompt +=
    "\nIdentify every visible item of personal property and assess its condition.";

  const response: RoutedAiResponse = await routeAiRequest(
    {
      taskType: "contents_manifest",
      systemPrompt: CONTENTS_MANIFEST_SYSTEM_PROMPT,
      userPrompt,
      visionInputs: photos,
      temperature: 0.2,
      maxTokens: 8192,
      timeoutMs: 120000, // 2 min — large photo sets need time
    },
    config,
  );

  // Parse the AI response
  const parsed = parseContentsManifestOutput(response.text);

  if (!parsed || !parsed.items.length) {
    throw new Error(
      "AI could not identify any contents from the provided photos. " +
        "Ensure photos clearly show affected contents/belongings.",
    );
  }

  // Compute totals
  const totalValue = parsed.items.reduce(
    (sum, item) => sum + item.estimatedValueAud * item.quantity,
    0,
  );
  const avgConfidence =
    parsed.items.reduce((sum, item) => sum + item.confidence, 0) /
    parsed.items.length;

  // Assign UUIDs to items
  const itemsWithIds: ContentsManifestItem[] = parsed.items.map(
    (item, index) => ({
      ...item,
      id: generateItemId(inspectionId, index),
      verified: false,
    }),
  );

  return {
    inspectionId,
    items: itemsWithIds,
    photosAnalysed: photos.length,
    totalEstimatedValueAud: Math.round(totalValue * 100) / 100,
    overallConfidence: Math.round(avgConfidence * 100) / 100,
    model: response.model,
    tier: "premium",
    durationMs: response.durationMs,
    estimatedCostUsd: response.estimatedCostUsd ?? 0,
    generatedAt: new Date().toISOString(),
    summary: parsed.summary,
  };
}

// ━━━ Output Parser ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ParsedManifestOutput {
  items: Omit<ContentsManifestItem, "id" | "verified" | "technicianNotes">[];
  summary?: string;
}

/**
 * Parse AI response text into structured contents manifest output.
 * Expects JSON — falls back to partial extraction.
 */
function parseContentsManifestOutput(
  text: string,
): ParsedManifestOutput | null {
  // Try direct JSON parse
  const jsonMatch =
    text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const raw = JSON.parse(jsonMatch[1] ?? jsonMatch[0]);
    return validateManifestOutput(raw);
  } catch {
    return null;
  }
}

function validateManifestOutput(
  raw: Record<string, unknown>,
): ParsedManifestOutput | null {
  if (!Array.isArray(raw.items) || raw.items.length === 0) return null;

  const validConditions = new Set(CONTENTS_CONDITIONS);
  const validCategories = new Set(CONTENTS_CATEGORIES);
  const validRestorability = new Set([
    "restorable",
    "questionable",
    "non_restorable",
  ]);

  const items: ParsedManifestOutput["items"] = [];

  for (const rawItem of raw.items) {
    if (typeof rawItem !== "object" || rawItem === null) continue;
    const item = rawItem as Record<string, unknown>;

    // Required: description
    if (typeof item.description !== "string" || !item.description.trim()) {
      continue;
    }

    // Validate category — default to "other"
    const category = validCategories.has(item.category as ContentsCategory)
      ? (item.category as ContentsCategory)
      : "other";

    // Validate condition — default to "water_damaged"
    const condition = validConditions.has(item.condition as ContentsCondition)
      ? (item.condition as ContentsCondition)
      : "water_damaged";

    // Validate restorability — default to "questionable"
    const restorability = validRestorability.has(
      item.restorability as RestorabilityVerdict,
    )
      ? (item.restorability as RestorabilityVerdict)
      : "questionable";

    // Numeric fields with defaults
    const estimatedValueAud =
      typeof item.estimatedValueAud === "number" && item.estimatedValueAud >= 0
        ? Math.round(item.estimatedValueAud * 100) / 100
        : 0;

    const quantity =
      typeof item.quantity === "number" && item.quantity >= 1
        ? Math.round(item.quantity)
        : 1;

    const confidence =
      typeof item.confidence === "number" &&
      item.confidence >= 0 &&
      item.confidence <= 1
        ? Math.round(item.confidence * 100) / 100
        : 0.5;

    // Skip very low confidence items
    if (confidence < 0.3) continue;

    const sourcePhotoIndices = Array.isArray(item.sourcePhotoIndices)
      ? item.sourcePhotoIndices.filter(
          (i: unknown) => typeof i === "number" && i >= 0,
        )
      : [0];

    items.push({
      description: item.description.trim(),
      category,
      room: typeof item.room === "string" ? item.room.trim() : "Unknown",
      condition,
      restorability,
      estimatedValueAud,
      quantity,
      confidence,
      sourcePhotoIndices,
      aiNotes:
        typeof item.aiNotes === "string" ? item.aiNotes.trim() : undefined,
    });
  }

  if (items.length === 0) return null;

  return {
    items,
    summary: typeof raw.summary === "string" ? raw.summary : undefined,
  };
}

// ━━━ ID Generation ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Generate a deterministic item ID from inspection ID and index.
 * Format: cm_{inspectionId-prefix}_{index}_{timestamp-suffix}
 */
function generateItemId(inspectionId: string, index: number): string {
  const prefix = inspectionId.slice(0, 8);
  const ts = Date.now().toString(36);
  return `cm_${prefix}_${index}_${ts}`;
}

// ━━━ CSV/XLSX Export ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** CSV header row for contents manifest export */
export const MANIFEST_CSV_HEADERS = [
  "Item #",
  "Description",
  "Category",
  "Room",
  "Condition",
  "Restorability",
  "Qty",
  "Est. Value (AUD)",
  "Line Total (AUD)",
  "Confidence",
  "Verified",
  "Technician Notes",
  "AI Notes",
] as const;

/**
 * Convert a contents manifest to CSV string for export.
 * Includes header row and all items sorted by room then category.
 */
export function manifestToCsv(manifest: ContentsManifest): string {
  const rows: string[][] = [Array.from(MANIFEST_CSV_HEADERS)];

  const sorted = [...manifest.items].sort((a, b) => {
    const roomCmp = a.room.localeCompare(b.room);
    if (roomCmp !== 0) return roomCmp;
    return a.category.localeCompare(b.category);
  });

  sorted.forEach((item, idx) => {
    rows.push([
      String(idx + 1),
      item.description,
      CONTENTS_CATEGORY_LABELS[item.category],
      item.room,
      CONTENTS_CONDITION_LABELS[item.condition],
      item.restorability === "restorable"
        ? "Restorable"
        : item.restorability === "questionable"
          ? "Questionable"
          : "Non-Restorable",
      String(item.quantity),
      item.estimatedValueAud.toFixed(2),
      (item.estimatedValueAud * item.quantity).toFixed(2),
      `${Math.round(item.confidence * 100)}%`,
      item.verified ? "Yes" : "No",
      item.technicianNotes ?? "",
      item.aiNotes ?? "",
    ]);
  });

  // Add summary row
  rows.push([]);
  rows.push([
    "",
    "TOTAL",
    "",
    "",
    "",
    "",
    String(manifest.items.reduce((s, i) => s + i.quantity, 0)),
    "",
    manifest.totalEstimatedValueAud.toFixed(2),
    `${Math.round(manifest.overallConfidence * 100)}% avg`,
    "",
    "",
    "",
  ]);
  rows.push([
    "",
    `Generated: ${manifest.generatedAt} | Model: ${manifest.model} | Photos: ${manifest.photosAnalysed}`,
  ]);

  return rows
    .map((row) =>
      row
        .map((cell) => {
          const escaped = cell.replace(/"/g, '""');
          return cell.includes(",") || cell.includes('"') || cell.includes("\n")
            ? `"${escaped}"`
            : escaped;
        })
        .join(","),
    )
    .join("\n");
}

/**
 * Convert a contents manifest to a 2D array for XLSX export.
 * Compatible with the existing excel-export.ts utilities.
 */
export function manifestToXlsxData(manifest: ContentsManifest): string[][] {
  const rows: string[][] = [Array.from(MANIFEST_CSV_HEADERS)];

  const sorted = [...manifest.items].sort((a, b) => {
    const roomCmp = a.room.localeCompare(b.room);
    if (roomCmp !== 0) return roomCmp;
    return a.category.localeCompare(b.category);
  });

  sorted.forEach((item, idx) => {
    rows.push([
      String(idx + 1),
      item.description,
      CONTENTS_CATEGORY_LABELS[item.category],
      item.room,
      CONTENTS_CONDITION_LABELS[item.condition],
      item.restorability === "restorable"
        ? "Restorable"
        : item.restorability === "questionable"
          ? "Questionable"
          : "Non-Restorable",
      String(item.quantity),
      item.estimatedValueAud.toFixed(2),
      (item.estimatedValueAud * item.quantity).toFixed(2),
      `${Math.round(item.confidence * 100)}%`,
      item.verified ? "Yes" : "No",
      item.technicianNotes ?? "",
      item.aiNotes ?? "",
    ]);
  });

  return rows;
}

// ━━━ Manifest Statistics ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Summary statistics for a contents manifest */
export interface ManifestStatistics {
  totalItems: number;
  totalQuantity: number;
  totalEstimatedValueAud: number;
  itemsByRoom: Record<string, number>;
  itemsByCategory: Partial<Record<ContentsCategory, number>>;
  itemsByCondition: Partial<Record<ContentsCondition, number>>;
  restorableCount: number;
  questionableCount: number;
  nonRestorableCount: number;
  averageConfidence: number;
  lowConfidenceCount: number;
  verifiedCount: number;
  unverifiedCount: number;
}

/**
 * Compute summary statistics from a contents manifest.
 * Used for dashboard display and reporting.
 */
export function computeManifestStatistics(
  manifest: ContentsManifest,
): ManifestStatistics {
  const items = manifest.items;

  const itemsByRoom: Record<string, number> = {};
  const itemsByCategory: Partial<Record<ContentsCategory, number>> = {};
  const itemsByCondition: Partial<Record<ContentsCondition, number>> = {};

  let restorableCount = 0;
  let questionableCount = 0;
  let nonRestorableCount = 0;
  let lowConfidenceCount = 0;
  let verifiedCount = 0;

  for (const item of items) {
    // Room counts
    itemsByRoom[item.room] = (itemsByRoom[item.room] ?? 0) + item.quantity;

    // Category counts
    itemsByCategory[item.category] =
      (itemsByCategory[item.category] ?? 0) + item.quantity;

    // Condition counts
    itemsByCondition[item.condition] =
      (itemsByCondition[item.condition] ?? 0) + item.quantity;

    // Restorability
    if (item.restorability === "restorable") restorableCount += item.quantity;
    else if (item.restorability === "questionable")
      questionableCount += item.quantity;
    else nonRestorableCount += item.quantity;

    // Confidence
    if (item.confidence < 0.6) lowConfidenceCount++;

    // Verified
    if (item.verified) verifiedCount++;
  }

  return {
    totalItems: items.length,
    totalQuantity: items.reduce((s, i) => s + i.quantity, 0),
    totalEstimatedValueAud: manifest.totalEstimatedValueAud,
    itemsByRoom,
    itemsByCategory,
    itemsByCondition,
    restorableCount,
    questionableCount,
    nonRestorableCount,
    averageConfidence: manifest.overallConfidence,
    lowConfidenceCount,
    verifiedCount,
    unverifiedCount: items.length - verifiedCount,
  };
}

// ━━━ Cost Estimation ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Estimate the cost of generating a contents manifest.
 * Used for pre-generation cost disclosure to user.
 *
 * @param photoCount - Number of photos to analyse
 * @param model - BYOK model to use
 * @returns Estimated cost in USD
 */
export function estimateManifestCost(
  photoCount: number,
  model: AllowedModel,
): { estimatedCostUsd: number; estimatedDurationSec: number } {
  // Token estimates: ~1500 tokens per photo input, ~200 tokens per output item
  // Assume ~5 items identified per photo
  const inputTokens = photoCount * 1500 + 800; // photos + system prompt
  const outputTokens = photoCount * 5 * 200 + 500; // items + summary

  // Pricing per million tokens (approximate)
  const rates: Record<string, { input: number; output: number }> = {
    "claude-opus-4-6": { input: 15.0, output: 75.0 },
    "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
    "gemini-3.1-pro": { input: 1.25, output: 5.0 },
    "gemini-3.1-flash": { input: 0.15, output: 0.6 },
    "gpt-5.4": { input: 5.0, output: 15.0 },
    "gpt-5.4-mini": { input: 0.5, output: 1.5 },
  };

  const rate = rates[model] ?? rates["claude-sonnet-4-6"];

  const costUsd =
    (inputTokens * rate.input) / 1_000_000 +
    (outputTokens * rate.output) / 1_000_000;

  // Duration estimate: ~2-4 sec per photo
  const durationSec = Math.max(5, photoCount * 3);

  return {
    estimatedCostUsd: Math.round(costUsd * 10000) / 10000,
    estimatedDurationSec: durationSec,
  };
}
