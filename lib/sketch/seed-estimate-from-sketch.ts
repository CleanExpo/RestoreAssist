/**
 * RA-7608 — map GET /sketches/estimate room lines onto POST /api/estimates
 * line items so measured floor-plan areas are not retyped by hand.
 *
 * Area maths stays in `room-area-from-geometry.ts` (via the existing extractor).
 * This module only filters to operator-measured room lines and reshapes them
 * for the estimate POST body.
 *
 * Provenance skip filters in `sketch-estimate-extractor.ts`,
 * `isMeasuredRoom`, and `measuredSketchData()` are RA-7611 allow-lists
 * (operator_measured only). This path still drops a non-measured room so a
 * stale GET payload cannot become an estimate line.
 */

import type {
  EstimateLineItem,
  SketchEstimate,
} from "@/lib/sketch-estimate-extractor";

/** Prefix used so a re-import can replace previously seeded room lines. */
export const SKETCH_ROOM_LINE_CODE_PREFIX = "PLAN";

export const SKETCH_ROOM_ESTIMATE_CATEGORY = "Restoration/Build-Back";

export interface EstimatePostLineItem {
  code: string;
  category: string;
  description: string;
  qty: number;
  unit: string;
  rate: number;
  formula: string | null;
  subtotal: number;
  isScopeLinked: boolean;
  isEstimatorAdded: boolean;
  displayOrder: number;
}

function readApiError(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const rec = body as { error?: unknown; message?: unknown };
  if (typeof rec.error === "string" && rec.error.trim()) return rec.error;
  if (
    rec.error &&
    typeof rec.error === "object" &&
    typeof (rec.error as { message?: unknown }).message === "string"
  ) {
    const msg = (rec.error as { message: string }).message.trim();
    if (msg) return msg;
  }
  if (typeof rec.message === "string" && rec.message.trim()) return rec.message;
  return fallback;
}

/** Room lines from operator_measured geometry (untagged = technician-drawn). */
export function isOperatorMeasuredRoomLine(item: EstimateLineItem): boolean {
  if (item.category !== "room") return false;
  const provenance = item.provenance;
  if (provenance == null || provenance === "") return true;
  return provenance === "operator_measured";
}

/**
 * Room lines from a GET /sketches/estimate payload, shaped for POST /api/estimates.
 */
export function seedEstimateLineItemsFromSketch(
  sketchEstimate: SketchEstimate,
  displayOrderStart = 0,
): EstimatePostLineItem[] {
  const rooms = sketchEstimate.lineItems.filter(isOperatorMeasuredRoomLine);
  return rooms.map((item, i) => ({
    code: `${SKETCH_ROOM_LINE_CODE_PREFIX}-${i + 1}`,
    category: SKETCH_ROOM_ESTIMATE_CATEGORY,
    description: item.description,
    qty: item.quantity,
    unit: item.unit,
    rate: 0,
    formula: item.notes ?? "Floor area from floor plan",
    subtotal: 0,
    isScopeLinked: true,
    isEstimatorAdded: false,
    displayOrder: displayOrderStart + i,
  }));
}

export function mergeSketchRoomLines<T extends { code?: string | null }>(
  existing: T[],
  seeded: EstimatePostLineItem[],
): Array<T | EstimatePostLineItem> {
  const kept = existing.filter(
    (item) =>
      !String(item.code ?? "").startsWith(`${SKETCH_ROOM_LINE_CODE_PREFIX}-`),
  );
  return [
    ...kept,
    ...seeded.map((item, i) => ({
      ...item,
      displayOrder: kept.length + i,
    })),
  ];
}

export type CreateEstimateFromSketchResult =
  | { ok: true; estimate: { id?: string; lineItems?: EstimatePostLineItem[] } }
  | { ok: false; error: string };

/**
 * GET sketches/estimate, keep operator-measured room lines, POST /api/estimates.
 */
export async function createEstimateFromSketch(input: {
  inspectionId: string;
  reportId: string;
  scopeId?: string;
  existingLineItems?: Array<{ code?: string | null } & Record<string, unknown>>;
  estimateFields?: Record<string, unknown>;
}): Promise<CreateEstimateFromSketchResult> {
  const { inspectionId, reportId, scopeId, existingLineItems, estimateFields } =
    input;

  if (!inspectionId) {
    return {
      ok: false,
      error: "This report is not linked to an inspection floor plan",
    };
  }
  if (!reportId) {
    return { ok: false, error: "Missing report" };
  }

  let sketchRes: Response;
  try {
    sketchRes = await fetch(
      `/api/inspections/${inspectionId}/sketches/estimate`,
    );
  } catch {
    return { ok: false, error: "Could not read floor-plan rooms" };
  }

  let sketchBody: unknown;
  try {
    sketchBody = await sketchRes.json();
  } catch {
    return { ok: false, error: "Could not read floor-plan rooms" };
  }

  if (!sketchRes.ok) {
    return {
      ok: false,
      error: readApiError(sketchBody, "Could not read floor-plan rooms"),
    };
  }

  const sketchEstimate = (sketchBody as { estimate?: SketchEstimate }).estimate;
  if (!sketchEstimate || !Array.isArray(sketchEstimate.lineItems)) {
    return { ok: false, error: "Could not read floor-plan rooms" };
  }

  const seeded = seedEstimateLineItemsFromSketch(sketchEstimate);
  if (seeded.length === 0) {
    return { ok: false, error: "No measured rooms on the floor plan" };
  }

  const existing = Array.isArray(existingLineItems) ? existingLineItems : [];
  const lineItems = mergeSketchRoomLines(existing, seeded);

  const payload: Record<string, unknown> = {
    ...(estimateFields ?? {}),
    reportId,
    lineItems,
  };
  if (scopeId) payload.scopeId = scopeId;

  let postRes: Response;
  try {
    postRes = await fetch("/api/estimates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, error: "Could not save the estimate" };
  }

  let postBody: unknown;
  try {
    postBody = await postRes.json();
  } catch {
    return { ok: false, error: "Could not save the estimate" };
  }

  if (!postRes.ok) {
    return {
      ok: false,
      error: readApiError(postBody, "Could not save the estimate"),
    };
  }

  return {
    ok: true,
    estimate: postBody as { id?: string; lineItems?: EstimatePostLineItem[] },
  };
}
