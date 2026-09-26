/**
 * RA-7613 — connect photo-AI classifications to the existing WHS asbestos gate.
 *
 * `evaluateWhsGate` stays the owner of strip-out blocking. This module only
 * decides whether photo-AI output may *raise* suspected ACM. AI can raise the
 * latch and can never clear it — including a later classification that finds
 * no ACM. Only a person recording a WHS pathway (passed through to the gate)
 * clears the block.
 *
 * AI never blocks evidence submission (RA-7076). Non-destructive actions stay
 * allowed; the gate still only blocks strip-out / demolition.
 *
 * Persistence uses InspectionPhoto.metadata.photoAi.whsLatch (existing JSON
 * column — no schema change).
 */

import { getMaterial } from "./materials";
import {
  evaluateWhsGate,
  type HazardStatus,
  type WhsGateResult,
} from "./whs-gate";
import type { AsbestosJurisdiction } from "@/lib/compliance/asbestos-era";

export const PHOTO_AI_METADATA_KEY = "photoAi";

export interface AiAcmLatch {
  aiRaisedAcm: boolean;
}

export function emptyAiAcmLatch(): AiAcmLatch {
  return { aiRaisedAcm: false };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/**
 * True when classifier labels name suspected ACM.
 *
 * Primary signal is `ASBESTOS_SUSPECT` (auto-classify-photo / S500 labels).
 * A material slug that the ANZ library flags as potential ACM also raises —
 * exact slug only, never a substring guess.
 */
export function classificationHasSuspectedAcm(labels: unknown): boolean {
  const rec = asRecord(labels);
  if (!rec) return false;

  const indicators = stringList(rec.secondaryDamageIndicators).map((s) =>
    s.trim().toUpperCase(),
  );
  if (indicators.includes("ASBESTOS_SUSPECT")) return true;

  for (const raw of stringList(rec.affectedMaterial)) {
    const slug = raw.trim().toLowerCase().replace(/_/g, "-");
    if (getMaterial(slug)?.isPotentialAcm) return true;
    if (slug === "fibro") return true;
  }

  return false;
}

/** Raise-only: a no-ACM classification leaves a prior raise in place. */
export function applyAiAcmLatch(
  latch: AiAcmLatch,
  labels: unknown,
): AiAcmLatch {
  if (classificationHasSuspectedAcm(labels)) {
    return { aiRaisedAcm: true };
  }
  return { aiRaisedAcm: latch.aiRaisedAcm === true };
}

export function readPhotoAiLatch(metadata: unknown): AiAcmLatch {
  const root = asRecord(metadata);
  const photoAi = asRecord(root?.[PHOTO_AI_METADATA_KEY]);
  const whsLatch = asRecord(photoAi?.whsLatch);
  return { aiRaisedAcm: whsLatch?.aiRaisedAcm === true };
}

export function jobHasAiRaisedAcm(
  photos: Array<{ metadata?: unknown } | null | undefined>,
): boolean {
  return photos.some((photo) => readPhotoAiLatch(photo?.metadata).aiRaisedAcm);
}

/**
 * RA-7640 — spread into an Inspection `select` to fetch the photo-AI latch for
 * the scope and PDF routes; pass the result to `jobHasAiRaisedAcm`.
 *
 * The database filters to latched photos before `take: 1` applies, so the
 * bound cannot drop a latched photo the way a capped list of every photo could.
 */
export const AI_RAISED_ACM_PHOTOS_SELECT = {
  photos: {
    where: {
      metadata: {
        path: [PHOTO_AI_METADATA_KEY, "whsLatch", "aiRaisedAcm"],
        equals: true,
      },
    },
    select: { metadata: true },
    take: 1,
  },
};

export interface PhotoAiWhsInput {
  labels?: unknown;
  latch?: AiAcmLatch;
  propertyYearBuilt?: number;
  jurisdiction?: AsbestosJurisdiction;
  action?: string;
  whsPathwayNote?: string;
  hazardStatus?: HazardStatus;
}

/**
 * Feed a photo classification (and any prior AI latch) into evaluateWhsGate.
 * Defaults the action to strip-out — the gate's destructive work.
 */
export function evaluateStripOutFromPhotoClassification(
  input: PhotoAiWhsInput,
): WhsGateResult {
  const latch = applyAiAcmLatch(input.latch ?? emptyAiAcmLatch(), input.labels);
  return evaluateWhsGate({
    isPotentialAcm: latch.aiRaisedAcm,
    propertyYearBuilt: input.propertyYearBuilt,
    jurisdiction: input.jurisdiction,
    action: input.action ?? "strip_out",
    whsPathwayNote: input.whsPathwayNote,
    hazardStatus: input.hazardStatus,
  });
}
