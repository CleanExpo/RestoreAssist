/**
 * Fire and smoke walkthrough status: one pure function over every fire
 * observation on the job, from every session (spec §0 R1–R3).
 *
 * The route, the submit gate and the page all reach status through this
 * function, so the screen and the gate cannot disagree.
 */

import {
  FIRE_OBSERVATION_TYPES,
  entryParsedSchema,
  naParsedSchema,
  noticeParsedSchema,
  signoffParsedSchema,
  type FireObservationRow,
  type SectionStatus,
  type WalkthroughStatus,
} from "./schema";

function toMillis(value: Date | string): number {
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Write order. Each fire write takes its sequence number while it holds
 * the inspection row lock, so sequence numbers are unique per inspection
 * and follow commit order. Timestamps never decide order: two writes in
 * the same millisecond must still have one fixed winner. Rows without a
 * sequence are left out.
 */
function inWriteOrder(observations: readonly FireObservationRow[]): FireObservationRow[] {
  return observations
    .filter((row) => Number.isInteger(row.seq) && row.seq > 0)
    .sort((a, b) => a.seq - b.seq || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The sequence number the next fire write on this inspection takes. */
export function nextFireSeq(observations: readonly FireObservationRow[]): number {
  return observations.reduce((max, row) => (row.seq > max ? row.seq : max), 0) + 1;
}

interface SectionTally {
  state: SectionStatus["state"];
  entryCount: number;
  notes: string[];
  naReason?: string;
}

/** Newest valid observation per section wins: entry → filled, N/A → na. */
function tallySections(
  sectionIds: readonly string[],
  ordered: FireObservationRow[],
): {
  tallies: Map<string, SectionTally>;
  sectionRowIds: string[];
} {
  const known = new Set(sectionIds);
  const tallies = new Map<string, SectionTally>(
    sectionIds.map((id) => [id, { state: "todo", entryCount: 0, notes: [] }]),
  );
  const sectionRowIds: string[] = [];
  for (const row of ordered) {
    if (row.type === FIRE_OBSERVATION_TYPES.entry) {
      const parsed = entryParsedSchema.safeParse(row.parsed);
      if (!parsed.success || !known.has(parsed.data.sectionId)) continue;
      const tally = tallies.get(parsed.data.sectionId)!;
      tally.state = "filled";
      tally.entryCount += 1;
      tally.notes.push(parsed.data.note);
      tally.naReason = undefined;
      sectionRowIds.push(row.id);
    } else if (row.type === FIRE_OBSERVATION_TYPES.na) {
      const parsed = naParsedSchema.safeParse(row.parsed);
      if (!parsed.success || !known.has(parsed.data.sectionId)) continue;
      const tally = tallies.get(parsed.data.sectionId)!;
      tally.state = "na";
      tally.notes = [];
      tally.naReason = parsed.data.reason;
      sectionRowIds.push(row.id);
    }
  }
  return { tallies, sectionRowIds };
}

function latestSignoff(ordered: FireObservationRow[]) {
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    const row = ordered[i];
    if (row.type !== FIRE_OBSERVATION_TYPES.signoff) continue;
    const parsed = signoffParsedSchema.safeParse(row.parsed);
    if (parsed.success) return { row, parsed: parsed.data };
  }
  return null;
}

/**
 * Sections and sign-off are job-wide. The privacy notice is personal: it
 * counts only when the viewing technician acknowledged it in a session
 * they own. Pass null where no technician is viewing (the submit gate).
 */
export function computeWalkthroughStatus(
  sectionIds: readonly string[],
  observations: readonly FireObservationRow[],
  viewerUserId: string | null,
): WalkthroughStatus {
  const ordered = inWriteOrder(observations);
  const { tallies, sectionRowIds } = tallySections(
    sectionIds,
    ordered,
  );
  const sections: SectionStatus[] = sectionIds.map((sectionId) => ({
    sectionId,
    ...tallies.get(sectionId)!,
  }));
  const openSectionIds = sections
    .filter((s) => s.state === "todo")
    .map((s) => s.sectionId);
  const started = sectionRowIds.length > 0;
  const noticeAcknowledged =
    viewerUserId !== null &&
    observations.some(
      (row) =>
        row.type === FIRE_OBSERVATION_TYPES.notice &&
        row.userId === viewerUserId &&
      noticeParsedSchema.safeParse(row.parsed).success,
  );

  const signed = latestSignoff(ordered);
  let signoff: WalkthroughStatus["signoff"] = { state: "unsigned" };
  if (signed) {
    // Set membership, not timestamps: two rows written in the same
    // millisecond must not let a later edit hide behind the sign-off.
    const covered = new Set(signed.parsed.coveredRowIds);
    const stillCovers =
      started && sectionRowIds.every((rowId) => covered.has(rowId));
    signoff = {
      state: stillCovers ? "signed" : "changed",
      signedAt: new Date(toMillis(signed.row.createdAt)).toISOString(),
      typedName: signed.parsed.typedName,
    };
  }

  return {
    started,
    noticeAcknowledged,
    sections,
    openSectionIds,
    canSignOff: sectionIds.length > 0 && openSectionIds.length === 0,
    signoff,
  };
}

/** Ids of every valid section row: what a new sign-off covers. */
export function sectionObservationIds(
  sectionIds: readonly string[],
  observations: readonly FireObservationRow[],
): string[] {
  return tallySections(sectionIds, inWriteOrder(observations)).sectionRowIds;
}

/** The newest section observation time, as ISO, for a sign-off's coversThrough. */
export function newestSectionObservationAt(
  observations: readonly FireObservationRow[],
): string | null {
  let newest = 0;
  for (const row of observations) {
    if (
      row.type === FIRE_OBSERVATION_TYPES.entry ||
      row.type === FIRE_OBSERVATION_TYPES.na
    ) {
      newest = Math.max(newest, toMillis(row.createdAt));
    }
  }
  return newest > 0 ? new Date(newest).toISOString() : null;
}

export type FireGateOutcome =
  | "no_walkthrough"
  | "signed"
  | "refused_unsigned"
  | "refused_changed";

/**
 * Submit gate verdict. Keyed on "walkthrough started", never on claimType,
 * so a later route overwriting claimType cannot switch the gate off.
 */
export function evaluateFireGate(status: WalkthroughStatus): {
  outcome: FireGateOutcome;
  canSubmit: boolean;
} {
  if (!status.started) return { outcome: "no_walkthrough", canSubmit: true };
  if (status.signoff.state === "signed") {
    return { outcome: "signed", canSubmit: true };
  }
  if (status.signoff.state === "changed") {
    return { outcome: "refused_changed", canSubmit: false };
  }
  return { outcome: "refused_unsigned", canSubmit: false };
}
