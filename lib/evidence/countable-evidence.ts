/**
 * RA-8388 - which evidence records count toward a minimum.
 *
 * A signed moisture reading cannot be edited, so a mistyped one is retired
 * (MoistureReading.invalidatedAt). Retiring leaves the signed evidence record
 * in place, which is right for the audit trail, but that record must stop
 * counting toward a step minimum or a readiness verdict: otherwise a job
 * shows five of five readings with only four valid ones.
 *
 * This is the single owner of that rule. Every reader that COUNTS evidence
 * toward a minimum or a readiness verdict calls countableEvidence(). Readers
 * that LIST or EXPORT evidence (the evidence list, the dispute pack, the
 * contents manifest) deliberately do not: a retired record is still part of
 * the signed history.
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

/** Narrow an evidence query to the records that count. */
export function countableEvidence(
  where: Prisma.EvidenceItemWhereInput = {},
): Prisma.EvidenceItemWhereInput {
  return { AND: [where, COUNTABLE_EVIDENCE_WHERE] };
}
