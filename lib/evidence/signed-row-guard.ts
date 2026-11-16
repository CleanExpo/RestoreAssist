/**
 * RA-8388 AMENDMENT 05 - the one rule about rows a signature vouches for.
 *
 * A `MoistureReading` or `EnvironmentalData` row with a non-null
 * `evidenceItemId` was written from a signed capture. The signature covers
 * the values the technician entered. If another screen edits those values in
 * place, the signed record says 68% and the stored row says 72% - and in a
 * dispute that reads as tampering by a system that was never tampered with.
 * If another screen deletes the row, the evidence record cites a reading the
 * job no longer holds.
 *
 * So a linked row's signed values are corrected by invalidating the reading
 * and capturing it again, never by editing or removing it.
 *
 * WHY THIS IS A MODULE
 *
 * The principal-engineer bench found the hazard because nobody had listed who
 * else writes these two tables. More than one route does. A rule copied into
 * each of them is a rule that is missing from the next one, so the list of
 * signed columns and the comparison live here and every writer calls them.
 *
 * The rule is deliberately narrow. The NIR form resubmits every reading it
 * loaded, so a save that sends a linked row back unchanged must succeed, and
 * columns no signature covers (map pin, room, baseline and monitoring flags,
 * dew point, weather) stay editable.
 */

/** Columns of `MoistureReading` the signed payload vouches for. */
export const SIGNED_MOISTURE_FIELDS = [
  "location",
  "surfaceType",
  "moistureLevel",
  "depth",
] as const;

/** Columns of `EnvironmentalData` the signed payload vouches for. */
export const SIGNED_ENVIRONMENTAL_FIELDS = [
  "ambientTemperature",
  "humidityLevel",
  "location",
] as const;

export type SignedRowTable = "moistureReading" | "environmentalData";

export const SIGNED_FIELDS: Record<SignedRowTable, readonly string[]> = {
  moistureReading: SIGNED_MOISTURE_FIELDS,
  environmentalData: SIGNED_ENVIRONMENTAL_FIELDS,
};

/** Whether a stored row was written from a signed capture. */
export function isSignedRow(row: { evidenceItemId?: string | null }): boolean {
  return typeof row.evidenceItemId === "string" && row.evidenceItemId.length > 0;
}

function sameValue(stored: unknown, submitted: unknown): boolean {
  if (typeof stored === "number" && typeof submitted === "number") {
    return stored === submitted;
  }
  return (stored ?? null) === (submitted ?? null);
}

/**
 * Which signed columns a save would change on one stored row.
 *
 * A column is compared only when at least one candidate actually carries it:
 * a save that does not mention a column is not changing it.
 *
 * Several candidates may be passed for one save - typically the value as
 * submitted and the value after the route's own sanitising. The column counts
 * as unchanged if ANY of them equals what is stored. Without that, a form
 * that faithfully resubmits a stored value the sanitiser would spell
 * differently would be refused on every save for doing nothing.
 */
export function changedSignedFields(
  table: SignedRowTable,
  stored: Record<string, unknown>,
  ...candidates: Array<Record<string, unknown>>
): string[] {
  const changed: string[] = [];
  for (const field of SIGNED_FIELDS[table]) {
    const offered = candidates.filter((candidate) => field in candidate);
    if (offered.length === 0) continue;
    const unchanged = offered.some((candidate) =>
      sameValue(stored[field], candidate[field]),
    );
    if (!unchanged) changed.push(field);
  }
  return changed;
}

/** Remove the signed columns from an update, leaving the rest to be saved. */
export function withoutSignedFields<T extends Record<string, unknown>>(
  table: SignedRowTable,
  data: T,
): Partial<T> {
  const signed = new Set<string>(SIGNED_FIELDS[table]);
  return Object.fromEntries(
    Object.entries(data).filter(([key]) => !signed.has(key)),
  ) as Partial<T>;
}

export type SignedRowAction = "edit" | "delete";

/**
 * Thrown, or built and returned, when a save would break a signed row. The
 * message is written for the technician and is safe to show as it stands.
 */
export class SignedRowError extends Error {
  readonly action: SignedRowAction;
  readonly table: SignedRowTable;
  readonly rowId: string;
  readonly fields: string[];

  constructor(input: {
    action: SignedRowAction;
    table: SignedRowTable;
    rowId: string;
    fields?: string[];
  }) {
    super(signedRowRefusal(input.action, input.table));
    this.name = "SignedRowError";
    this.action = input.action;
    this.table = input.table;
    this.rowId = input.rowId;
    this.fields = input.fields ?? [];
  }
}

/** The one wording of the refusal, so every writer says the same thing. */
export function signedRowRefusal(
  action: SignedRowAction,
  table: SignedRowTable,
): string {
  const what =
    table === "moistureReading" ? "moisture reading" : "ambient reading";
  const verb = action === "delete" ? "removed" : "changed";
  return `This ${what} is part of the signed evidence record and cannot be ${verb} here. To correct it, invalidate it with a reason and capture it again.`;
}

/**
 * The refusal for `DELETE /evidence` when the evidence record still backs a
 * counted reading. The database refuses that delete as well (ON DELETE NO
 * ACTION); this says why in words, instead of surfacing a constraint error.
 */
export const EVIDENCE_BACKS_READING_REFUSAL =
  "This evidence is the signed record behind a reading that counts toward this job, so it cannot be deleted. To correct the reading, invalidate it with a reason and capture it again.";
