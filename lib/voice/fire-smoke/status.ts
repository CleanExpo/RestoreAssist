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

function byCreatedAt(a: FireObservationRow, b: FireObservationRow): number {
  return toMillis(a.createdAt) - toMillis(b.createdAt);
}

interface SectionTally {
  state: SectionStatus["state"];
  entryCount: number;
  naReason?: string;
}

/** Newest valid observation per section wins: entry → filled, N/A → na. */
function tallySections(
  sectionIds: readonly string[],
  ordered: FireObservationRow[],
): { tallies: Map<string, SectionTally>; newestSectionAt: number } {
  const known = new Set(sectionIds);
  const tallies = new Map<string, SectionTally>(
    sectionIds.map((id) => [id, { state: "todo", entryCount: 0 }]),
  );
  let newestSectionAt = 0;
  for (const row of ordered) {
    if (row.type === FIRE_OBSERVATION_TYPES.entry) {
      const parsed = entryParsedSchema.safeParse(row.parsed);
      if (!parsed.success || !known.has(parsed.data.sectionId)) continue;
      const tally = tallies.get(parsed.data.sectionId)!;
      tally.state = "filled";
      tally.entryCount += 1;
      tally.naReason = undefined;
      newestSectionAt = Math.max(newestSectionAt, toMillis(row.createdAt));
    } else if (row.type === FIRE_OBSERVATION_TYPES.na) {
      const parsed = naParsedSchema.safeParse(row.parsed);
      if (!parsed.success || !known.has(parsed.data.sectionId)) continue;
      const tally = tallies.get(parsed.data.sectionId)!;
      tally.state = "na";
      tally.naReason = parsed.data.reason;
      newestSectionAt = Math.max(newestSectionAt, toMillis(row.createdAt));
    }
  }
  return { tallies, newestSectionAt };
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

export function computeWalkthroughStatus(
  sectionIds: readonly string[],
  observations: readonly FireObservationRow[],
): WalkthroughStatus {
  const ordered = [...observations].sort(byCreatedAt);
  const { tallies, newestSectionAt } = tallySections(sectionIds, ordered);
  const sections: SectionStatus[] = sectionIds.map((sectionId) => ({
    sectionId,
    ...tallies.get(sectionId)!,
  }));
  const openSectionIds = sections
    .filter((s) => s.state === "todo")
    .map((s) => s.sectionId);
  const started = newestSectionAt > 0;
  const noticeAcknowledged = ordered.some(
    (row) =>
      row.type === FIRE_OBSERVATION_TYPES.notice &&
      noticeParsedSchema.safeParse(row.parsed).success,
  );

  const signed = latestSignoff(ordered);
  let signoff: WalkthroughStatus["signoff"] = { state: "unsigned" };
  if (signed) {
    const covers = toMillis(signed.parsed.coversThrough);
    const stillCovers = started && covers >= newestSectionAt;
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
