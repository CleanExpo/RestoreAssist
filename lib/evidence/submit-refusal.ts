/**
 * RA-8388: turn a refused POST /api/inspections/[id]/submit into something a
 * technician can act on.
 *
 * The submit route refuses in three shapes, and the capture page used to
 * toast `data.error` for all of them:
 *   - 422 `{ error: "MISSING_AFFECTED_AREAS" }` (and two sibling codes) from
 *     validateSubmissionPayload - the technician saw the raw code;
 *   - 400 `{ error, missingCritical: [{ field, label }] }` from tiered
 *     completion - the labels were dropped;
 *   - the shared `apiError` envelope `{ error: { code, message } }`.
 * A job captured only through Guided Capture has no affected area, so the
 * first shape is exactly where a technician dead-ended with no way forward.
 *
 * Pure: no fetch, no React. The capture page renders what this returns.
 */

import { areasHref } from "@/lib/evidence/field-evidence-checklist-view";

export interface SubmitRefusalItem {
  /** Stable key for the missing thing, e.g. "affectedAreas". */
  key: string;
  /** What is missing, in plain words. */
  label: string;
  /** Where it is fixed. */
  href: string;
  /** The words on the link. */
  action: string;
}

export interface SubmitRefusal {
  /** One plain sentence. Never a raw machine code. */
  message: string;
  /** Empty when the refusal names nothing the technician can go and fix. */
  items: SubmitRefusalItem[];
}

const FALLBACK_MESSAGE =
  "This inspection could not be submitted. Please try again.";

function jobTabHref(inspectionId: string, tab: string): string {
  const params = new URLSearchParams({ tab });
  return `/dashboard/inspections/${inspectionId}?${params.toString()}`;
}

/**
 * One owner for "what is missing and where it is fixed". Keyed by the tiered
 * completion field name; the 422 codes below map onto the same keys so the
 * two refusal shapes cannot drift apart.
 */
function itemFor(
  inspectionId: string,
  key: string,
  serverLabel?: string,
): SubmitRefusalItem {
  switch (key) {
    case "affectedAreas":
      return {
        key,
        label: "No affected area has been added to this job",
        href: areasHref(inspectionId),
        action: "Add an affected area",
      };
    case "moistureReadings":
      return {
        key,
        label: "No moisture readings are recorded",
        href: jobTabHref(inspectionId, "moisture"),
        action: "Go to moisture readings",
      };
    case "photos":
      return {
        key,
        label: "No photos are recorded",
        href: jobTabHref(inspectionId, "photos"),
        action: "Go to photos",
      };
    default:
      return {
        key,
        label: serverLabel ? `Missing: ${serverLabel}` : "A required detail is missing",
        href: jobTabHref(inspectionId, "overview"),
        action: "Open job details",
      };
  }
}

const CODE_TO_KEY: Record<string, string> = {
  MISSING_AFFECTED_AREAS: "affectedAreas",
  MISSING_MOISTURE_READINGS: "moistureReadings",
  MISSING_PHOTOS: "photos",
};

/** True for strings shaped like a machine code: MISSING_PHOTOS, INVALID_STATUS. */
function looksLikeCode(value: string): boolean {
  return /^[A-Z][A-Z0-9_]*$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function describeSubmitRefusal(
  inspectionId: string,
  body: unknown,
): SubmitRefusal {
  if (!isRecord(body)) {
    return { message: FALLBACK_MESSAGE, items: [] };
  }

  // 400 from tiered completion: a list of missing critical fields.
  if (Array.isArray(body.missingCritical) && body.missingCritical.length > 0) {
    const items: SubmitRefusalItem[] = [];
    for (const entry of body.missingCritical) {
      if (!isRecord(entry) || typeof entry.field !== "string") continue;
      const label = typeof entry.label === "string" ? entry.label : undefined;
      items.push(itemFor(inspectionId, entry.field, label));
    }
    if (items.length > 0) {
      return {
        message:
          items.length === 1
            ? "One thing is missing before this inspection can be submitted."
            : `${items.length} things are missing before this inspection can be submitted.`,
        items,
      };
    }
  }

  const error = body.error;

  // 422 / 409 from validateSubmissionPayload: a bare code.
  if (typeof error === "string") {
    const key = CODE_TO_KEY[error];
    if (key) {
      return {
        message: "One thing is missing before this inspection can be submitted.",
        items: [itemFor(inspectionId, key)],
      };
    }
    if (error === "INVALID_STATUS") {
      return {
        message:
          "This inspection has already been submitted or is no longer a draft, so it cannot be submitted again.",
        items: [],
      };
    }
    if (error.length > 0 && !looksLikeCode(error)) {
      return { message: error, items: [] };
    }
    return { message: FALLBACK_MESSAGE, items: [] };
  }

  // Shared apiError envelope: { error: { code, message } }.
  if (isRecord(error) && typeof error.message === "string") {
    const message = error.message;
    if (message.length > 0 && !looksLikeCode(message)) {
      return { message, items: [] };
    }
  }

  return { message: FALLBACK_MESSAGE, items: [] };
}
