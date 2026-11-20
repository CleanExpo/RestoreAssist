/**
 * RA-8388 AMENDMENT 05 - the duplicate guard for a signed metadata capture.
 *
 * WHAT THE DATABASE ENFORCES
 *
 * `EvidenceItem` has a unique index, `EvidenceItem_signed_capture_key`, on
 * (inspectionId, evidenceClass, metadataSha256, capturedAt). One signed
 * capture can be stored once. A retry of the same draft after a lost
 * response carries the same digest and the same signed capture time, so the
 * second insert is refused by Postgres whatever the application-level
 * idempotency cache has forgotten by then.
 *
 * WHY THE CAPTURE TIME IS IN THE KEY
 *
 * The digest (lib/evidence/metadata-payload.ts) covers the class, the title,
 * the notes and the structured values. It does NOT cover when the reading
 * was taken. Two readings of 18.4% on the same wall an hour apart share a
 * digest, and a moisture survey needs five readings, some of which will be
 * equal. A key without the signed time would refuse the second one.
 *
 * WHY EXISTING ROWS CANNOT COLLIDE
 *
 * `metadataSha256` is written only for a signed submission. Every row that
 * predates the column holds NULL, and Postgres treats NULLs as distinct in a
 * unique index.
 *
 * This module owns the one question the route asks after a failed insert:
 * was that the duplicate guard? It answers by the index's own name or its
 * column list, so a different unique violation is never mistaken for it.
 */

/** Must equal the `map:` on the `@@unique` in prisma/schema.prisma. */
export const SIGNED_CAPTURE_INDEX = "EvidenceItem_signed_capture_key";

const KEY_COLUMNS = [
  "inspectionId",
  "evidenceClass",
  "metadataSha256",
  "capturedAt",
] as const;

function collectStrings(value: unknown, out: string[], depth = 0): void {
  if (depth > 6 || value === null || value === undefined) return;
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    // A column list arrives as an array of names. Joining it lets one test
    // recognise it without caring which driver produced it.
    if (value.every((entry) => typeof entry === "string")) {
      out.push(value.join(","));
      return;
    }
    for (const entry of value) collectStrings(entry, out, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      collectStrings(entry, out, depth + 1);
    }
  }
}

/**
 * Whether a thrown error is Postgres refusing a second copy of one signed
 * capture.
 *
 * Prisma reports the violated constraint differently by driver: sometimes as
 * the index name, sometimes as the list of columns, and with a driver
 * adapter the detail sits under `meta.driverAdapterError`. Rather than pin
 * one shape and silently stop recognising duplicates on the next upgrade,
 * this reads every string the error's `meta` carries and accepts either the
 * index name or the exact column list. A real-database test holds it to the
 * shape the running driver actually produces.
 */
export function isSignedCaptureDuplicate(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; meta?: unknown };
  if (candidate.code !== "P2002") return false;

  const strings: string[] = [];
  collectStrings(candidate.meta, strings);

  return strings.some((text) => {
    if (text.includes(SIGNED_CAPTURE_INDEX)) return true;
    return KEY_COLUMNS.every((column) => text.includes(column));
  });
}
