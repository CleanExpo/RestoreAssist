import { FIRE_CHECKLIST_VERSION, FIRE_OBSERVATION_TYPES, type FireObservationRow } from "../schema";
import { FIRE_SECTION_IDS } from "../checklist";

let clock = Date.parse("2026-11-11T09:00:00Z");
export function resetClock(): void {
  clock = Date.parse("2026-11-11T09:00:00Z");
}
function tick(): Date {
  clock += 60_000;
  return new Date(clock);
}

export function entry(sectionId: string, note = "Synthetic note for testing"): FireObservationRow {
  return {
    type: FIRE_OBSERVATION_TYPES.entry,
    parsed: { checklistVersion: FIRE_CHECKLIST_VERSION, sectionId, note, routedBy: "router" },
    createdAt: tick(),
  };
}

export function na(sectionId: string, reason = "No gas connected to this property"): FireObservationRow {
  return {
    type: FIRE_OBSERVATION_TYPES.na,
    parsed: { checklistVersion: FIRE_CHECKLIST_VERSION, sectionId, reason, failedAttemptsBefore: 0 },
    createdAt: tick(),
  };
}

export function notice(): FireObservationRow {
  return {
    type: FIRE_OBSERVATION_TYPES.notice,
    parsed: {
      checklistVersion: FIRE_CHECKLIST_VERSION,
      noticeVersion: "fire-voice-notice-v1",
      spoken: true,
      recognitionMode: "cloud",
    },
    createdAt: tick(),
  };
}

export function signoff(coversThrough: Date | string): FireObservationRow {
  const at = typeof coversThrough === "string" ? coversThrough : coversThrough.toISOString();
  return {
    type: FIRE_OBSERVATION_TYPES.signoff,
    parsed: {
      checklistVersion: FIRE_CHECKLIST_VERSION,
      typedName: "Sam Example",
      declarationAccepted: true,
      signerUserId: "user-tech-1",
      coversThrough: at,
      sectionStates: {},
    },
    createdAt: tick(),
  };
}

/** Every section filled, in order. */
export function allFilled(): FireObservationRow[] {
  return FIRE_SECTION_IDS.map((id) => entry(id));
}

export function lastAt(rows: FireObservationRow[]): Date {
  return rows[rows.length - 1].createdAt as Date;
}
