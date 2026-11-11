/**
 * Fire and smoke make-safe walkthrough: the shapes stored in
 * VoiceCopilotObservation.parsed and the API request/response contract.
 *
 * One module, imported by the route, the submit gate and the page, so the
 * three can never disagree about a field (spec §0 R9).
 *
 * Walkthrough sign-off is NOT the RA-269 inspection signature: it neither
 * sets nor requires Inspection.signedAt.
 */

import { z } from "zod";

export const FIRE_CHECKLIST_VERSION = 1 as const;
export const FIRE_NOTICE_VERSION = "fire-voice-notice-v1";

/** The only observation types this feature writes. Built from a fixed map. */
export const FIRE_OBSERVATION_TYPES = {
  notice: "fire_notice_acknowledged",
  entry: "fire_section_entry",
  na: "fire_section_na",
  signoff: "fire_walkthrough_signoff",
} as const;

export type FireObservationType =
  (typeof FIRE_OBSERVATION_TYPES)[keyof typeof FIRE_OBSERVATION_TYPES];

export const ALL_FIRE_OBSERVATION_TYPES: readonly FireObservationType[] =
  Object.values(FIRE_OBSERVATION_TYPES);

/** Types that change a section's state (and so can stale a sign-off). */
export const FIRE_SECTION_OBSERVATION_TYPES: readonly FireObservationType[] = [
  FIRE_OBSERVATION_TYPES.entry,
  FIRE_OBSERVATION_TYPES.na,
];

export const MAX_NOTE_CHARS = 2000;
export const MAX_REASON_CHARS = 500;

const version = z.literal(FIRE_CHECKLIST_VERSION);

export const noticeParsedSchema = z.object({
  checklistVersion: version,
  noticeVersion: z.string().min(1),
  spoken: z.boolean(),
  recognitionMode: z.enum(["on_device", "cloud", "typed", "unknown"]),
});

export const entryParsedSchema = z.object({
  checklistVersion: version,
  sectionId: z.string().min(1),
  itemId: z.string().min(1).optional(),
  note: z.string().trim().min(1).max(MAX_NOTE_CHARS),
  routedBy: z.enum(["router", "technician_confirmed", "technician_chose"]),
});

export const naParsedSchema = z.object({
  checklistVersion: version,
  sectionId: z.string().min(1),
  reason: z.string().trim().min(1).max(MAX_REASON_CHARS),
  failedAttemptsBefore: z.number().int().min(0),
});

export const sectionStateSchema = z.enum(["filled", "na"]);

export const signoffParsedSchema = z.object({
  checklistVersion: version,
  typedName: z.string().trim().min(2).max(120),
  declarationAccepted: z.literal(true),
  signerUserId: z.string().min(1),
  coversThrough: z.string().min(1),
  /** Ids of every section row this sign-off covers; any other row means Changed. */
  coveredRowIds: z.array(z.string().min(1)).min(1),
  sectionStates: z.record(z.string(), sectionStateSchema),
});

export type NoticeParsed = z.infer<typeof noticeParsedSchema>;
export type EntryParsed = z.infer<typeof entryParsedSchema>;
export type NaParsed = z.infer<typeof naParsedSchema>;
export type SignoffParsed = z.infer<typeof signoffParsedSchema>;

/** A stored observation as the status function sees it. */
export interface FireObservationRow {
  id: string;
  /** Owner of the voice session that wrote the row (server truth), or null if unknown. */
  userId: string | null;
  /**
   * Write sequence, taken while the inspection row lock was held, so it is
   * unique and ordered per inspection. 0 when absent; such rows never
   * decide a section or a sign-off.
   */
  seq: number;
  type: string;
  parsed: unknown;
  createdAt: Date | string;
}

// ─── API contract ──────────────────────────────────────────────────────────

export const fireActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("acknowledge_notice"),
    sessionId: z.string().min(1),
    spoken: z.boolean(),
    recognitionMode: noticeParsedSchema.shape.recognitionMode,
  }),
  z.object({
    action: z.literal("capture"),
    sessionId: z.string().min(1),
    transcript: z.string().trim().min(1).max(MAX_NOTE_CHARS),
    currentSectionId: z.string().min(1).optional(),
  }),
  z.object({
    action: z.literal("file"),
    sessionId: z.string().min(1),
    transcript: z.string().trim().min(1).max(MAX_NOTE_CHARS),
    sectionId: z.string().min(1),
    routedBy: z.enum(["technician_confirmed", "technician_chose"]),
  }),
  z.object({
    action: z.literal("mark_na"),
    sessionId: z.string().min(1),
    sectionId: z.string().min(1),
    reason: z.string().trim().min(1).max(MAX_REASON_CHARS),
    failedAttemptsBefore: z.number().int().min(0).default(0),
  }),
  z.object({
    action: z.literal("sign_off"),
    sessionId: z.string().min(1),
    typedName: z.string().trim().min(2).max(120),
    declarationAccepted: z.literal(true),
    /** The reviewRevision of the job file the technician read before signing. */
    reviewedRevision: z.string().max(100_000),
  }),
]);

export type FireAction = z.infer<typeof fireActionSchema>;

export type SectionState = "todo" | "filled" | "na";
export type SignoffState = "unsigned" | "signed" | "changed";

export interface SectionStatus {
  sectionId: string;
  state: SectionState;
  entryCount: number;
  /**
   * The saved words that make up this section of the job file, in write
   * order. The technician reads these before signing; empty when N/A.
   */
  notes: string[];
  naReason?: string;
}

export interface WalkthroughStatus {
  started: boolean;
  noticeAcknowledged: boolean;
  sections: SectionStatus[];
  openSectionIds: string[];
  canSignOff: boolean;
  /**
   * Identifies exactly which saved answers make up the job file now. A
   * sign-off must quote it; any answer saved since makes it stale.
   */
  reviewRevision: string;
  signoff: {
    state: SignoffState;
    signedAt?: string;
    typedName?: string;
  };
}

export interface FireWalkthroughResponse {
  applicable: boolean;
  status: WalkthroughStatus;
  /** What Margot should say next, in the selected mode. */
  nextPrompt: string;
  nextSectionId: string | null;
}

export type CaptureOutcome =
  | { kind: "filed"; sectionId: string; say: string }
  | { kind: "ask"; candidateSectionId: string; say: string }
  | { kind: "marked_na"; sectionId: string; say: string }
  | { kind: "confirm_na"; sectionId: string; reason: string; say: string };

export interface FireActionResponse extends FireWalkthroughResponse {
  outcome?: CaptureOutcome;
}

/** 422 body when sign-off or submit is refused. */
export interface FireBlockerBody {
  error: string;
  code:
    | "NOTICE_REQUIRED"
    | "SECTIONS_OPEN"
    | "CHANGED_AFTER_SIGNOFF"
    | "REVIEW_STALE";
  openSectionIds: string[];
}
