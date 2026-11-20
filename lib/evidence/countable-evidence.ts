/**
 * RA-8388 - which evidence records count toward a minimum.
 *
 * A signed moisture reading cannot be edited, so a mistyped one is retired
 * (MoistureReading.invalidatedAt). Retiring leaves the signed evidence record
 * in place, which is right for the audit trail, but that record must stop
 * counting toward a step minimum or a readiness verdict: otherwise a job
 * shows five of five readings with only four valid ones.
 *
 * This is the single owner of that rule. A reader that COUNTS evidence
 * toward a minimum or a readiness verdict uses it: the step gate
 * (workflow/validate), the list the capture page counts from (workflow GET),
 * the completeness snapshot (submission-gate), the field evidence checklist,
 * the admin review step gaps and the insurer mandatory-evidence check.
 *
 * Readers that LIST, SCORE or EXPORT evidence deliberately do not (the
 * evidence list, per-item quality scores, the dispute pack, the contents
 * manifest, the knowledge index): a retired record is still part of the
 * signed history.
 *
 * Known limit: POST /submit does not check step minimums at all. The
 * five-reading floor is enforced by the step gate the capture screen shows.
 *
 * Evidence with no linked moisture reading (photos, notes, ambient readings)
 * always counts. Ambient readings have no retire marker.
 */
import type { Prisma } from "@prisma/client";

export const COUNTABLE_EVIDENCE_WHERE: Prisma.EvidenceItemWhereInput = {
  OR: [
    // No linked moisture reading: a photo, a note, an ambient reading.
    { moistureReading: { is: null } },
    // A linked moisture reading that has not been retired.
    { moistureReading: { is: { invalidatedAt: null } } },
  ],
};

/**
 * RA-8388 (founder ruling 17/11/2026) - the file URLs on this inspection whose
 * ONLY evidence records are REJECTED.
 *
 * A counted photograph is an `InspectionPhoto` row. That table has no link to
 * the evidence record it was written beside, so the two are matched on the
 * file URL: the same key the evidence delete path uses to remove the counted
 * row. A URL that a live (ACTIVE or FLAGGED) record still cites is left out,
 * because two records for one upload share one photo row.
 *
 * Today no route sets REJECTED; the status exists in the schema and can be
 * set by hand. This keeps submit honest if it ever is.
 *
 * Takes the inspection's file-bearing evidence records, selected with
 * FILE_EVIDENCE_STATUS_SELECT, so the caller reads them in the query it
 * already makes.
 */
export const FILE_EVIDENCE_STATUS_SELECT = {
  where: { fileUrl: { not: null } },
  select: { fileUrl: true, status: true },
} satisfies Prisma.EvidenceItemFindManyArgs;

export function rejectedOnlyFileUrls(
  items: readonly { fileUrl: string | null; status: string }[],
): Set<string> {
  const rejected = new Set<string>();
  const live = new Set<string>();
  for (const item of items) {
    if (!item.fileUrl) continue;
    (item.status === "REJECTED" ? rejected : live).add(item.fileUrl);
  }
  for (const url of live) rejected.delete(url);
  return rejected;
}

/** Drop the photographs whose only evidence record is REJECTED. */
export function withoutRejectedPhotographs<T extends { url: string }>(
  photos: readonly T[],
  rejectedOnly: ReadonlySet<string>,
): T[] {
  if (rejectedOnly.size === 0) return [...photos];
  return photos.filter((photo) => !rejectedOnly.has(photo.url));
}

/** Narrow an evidence query to the records that count. */
export function countableEvidence(
  where: Prisma.EvidenceItemWhereInput = {},
): Prisma.EvidenceItemWhereInput {
  return { AND: [where, COUNTABLE_EVIDENCE_WHERE] };
}
