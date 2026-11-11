/**
 * Fire walkthrough actions. Called by the route inside
 * writeWithinInspectionScope, so every write holds the inspection row
 * lock and recomputes status from all sessions first (spec §0 R1, R3).
 *
 * Only this module writes fire_* observation types, and only from the
 * fixed FIRE_OBSERVATION_TYPES map, never from the request body (R9).
 */

import { randomUUID } from "node:crypto";
import {
  FIRE_CHECKLIST,
  FIRE_SECTION_IDS,
  getFireSection,
  isFireSectionId,
} from "./checklist";
import { FIRE_COPY } from "./copy";
import { clarifyingQuestion, routeUtterance } from "./router";
import {
  FIRE_CHECKLIST_VERSION,
  FIRE_NOTICE_VERSION,
  FIRE_OBSERVATION_TYPES,
  entryParsedSchema,
  naParsedSchema,
  noticeParsedSchema,
  signoffParsedSchema,
  type CaptureOutcome,
  type FireAction,
  type FireBlockerBody,
  type FireObservationType,
  type WalkthroughStatus,
} from "./schema";
import { loadFireWalkthrough, type FireDb } from "./server";
import { newestSectionObservationAt, nextFireSeq, sectionObservationIds } from "./status";

export interface FireActionDb extends FireDb {
  voiceCopilotObservation: FireDb["voiceCopilotObservation"] & {
    create(args: unknown): Promise<unknown>;
  };
  auditLog: { create(args: unknown): Promise<unknown> };
}

export type FireActionResult =
  | { ok: true; status: WalkthroughStatus; outcome?: CaptureOutcome }
  | { ok: false; httpStatus: 400 | 422; body: FireBlockerBody | { error: string } };

/** What Margot says next, and which section she is on. */
export function nextStep(status: WalkthroughStatus): {
  nextPrompt: string;
  nextSectionId: string | null;
} {
  if (status.signoff.state === "signed") {
    return { nextPrompt: FIRE_COPY.signedOff, nextSectionId: null };
  }
  const open = status.openSectionIds[0];
  if (open) {
    return { nextPrompt: getFireSection(open)!.intro, nextSectionId: open };
  }
  if (status.signoff.state === "changed") {
    return { nextPrompt: FIRE_COPY.changedAfterSignoff, nextSectionId: null };
  }
  return { nextPrompt: FIRE_COPY.allDone, nextSectionId: null };
}

async function write(
  db: FireActionDb,
  sessionId: string,
  type: FireObservationType,
  rawTranscript: string,
  parsed: object,
  seq: number,
): Promise<void> {
  await db.voiceCopilotObservation.create({
    data: {
      id: randomUUID(),
      sessionId,
      type,
      rawTranscript,
      parsed: { ...parsed, seq },
      confidence: "high",
      needsConfirmation: false,
      createdAt: new Date(),
    },
  });
}

function sectionTitle(sectionId: string): string {
  return getFireSection(sectionId)?.title ?? sectionId;
}

const NOTICE_REQUIRED: FireActionResult = {
  ok: false,
  httpStatus: 422,
  body: {
    error: "The voice notice must be acknowledged before anything is recorded.",
    code: "NOTICE_REQUIRED",
    openSectionIds: [],
  },
};

const UNKNOWN_SECTION: FireActionResult = {
  ok: false,
  httpStatus: 400,
  body: { error: "Unknown section" },
};

export async function runFireAction(
  db: FireActionDb,
  ctx: { inspectionId: string; userId: string },
  action: FireAction,
): Promise<FireActionResult> {
  const before = await loadFireWalkthrough(ctx.inspectionId, db, ctx.userId);
  // Taken while this transaction holds the inspection row lock, so it is
  // unique and follows commit order. It, not createdAt, orders the rows.
  const seq = nextFireSeq(before.observations);
  let outcome: CaptureOutcome | undefined;

  if (action.action === "acknowledge_notice") {
    const parsed = noticeParsedSchema.parse({
      checklistVersion: FIRE_CHECKLIST_VERSION,
      noticeVersion: FIRE_NOTICE_VERSION,
      spoken: action.spoken,
      recognitionMode: action.recognitionMode,
    });
    await write(db, action.sessionId, FIRE_OBSERVATION_TYPES.notice, FIRE_COPY.notice, parsed, seq);
  } else if (action.action === "sign_off") {
    const result = await signOff(db, ctx, action, before.status, before.observations, seq);
    if (!result.ok) return result;
  } else {
    const sectionId = action.action === "capture" ? action.currentSectionId : action.sectionId;
    if (sectionId !== undefined && !isFireSectionId(sectionId)) return UNKNOWN_SECTION;
    if (!before.status.noticeAcknowledged) return NOTICE_REQUIRED;
    outcome = (await recordAnswer(db, action, seq)).outcome;
  }

  const after = await loadFireWalkthrough(ctx.inspectionId, db, ctx.userId);
  return { ok: true, status: after.status, outcome };
}

async function recordAnswer(
  db: FireActionDb,
  action: Extract<FireAction, { action: "capture" | "file" | "mark_na" }>,
  seq: number,
): Promise<{ ok: true; outcome: CaptureOutcome }> {
  // Section ids were checked in runFireAction before the notice gate.
  if (action.action === "capture") {
    const decision = routeUtterance(action.transcript, action.currentSectionId);
    if (decision.kind === "ask") {
      const say = clarifyingQuestion(decision.candidateSectionId);
      return { ok: true, outcome: { kind: "ask", candidateSectionId: decision.candidateSectionId, say } };
    }
    if (decision.kind === "na") {
      return markNa(db, action.sessionId, decision.sectionId, decision.reason, 0, action.transcript, seq);
    }
    return fileEntry(db, action.sessionId, decision.sectionId, action.transcript, "router", seq);
  }
  if (action.action === "file") {
    return fileEntry(db, action.sessionId, action.sectionId, action.transcript, action.routedBy, seq);
  }
  return markNa(db, action.sessionId, action.sectionId, action.reason, action.failedAttemptsBefore, action.reason, seq);
}

async function fileEntry(
  db: FireActionDb,
  sessionId: string,
  sectionId: string,
  note: string,
  routedBy: "router" | "technician_confirmed" | "technician_chose",
  seq: number,
): Promise<{ ok: true; outcome: CaptureOutcome }> {
  const parsed = entryParsedSchema.parse({
    checklistVersion: FIRE_CHECKLIST_VERSION,
    sectionId,
    note,
    routedBy,
  });
  await write(db, sessionId, FIRE_OBSERVATION_TYPES.entry, note, parsed, seq);
  return { ok: true, outcome: { kind: "filed", sectionId, say: FIRE_COPY.filed(sectionTitle(sectionId)) } };
}

async function markNa(
  db: FireActionDb,
  sessionId: string,
  sectionId: string,
  reason: string,
  failedAttemptsBefore: number,
  raw: string,
  seq: number,
): Promise<{ ok: true; outcome: CaptureOutcome }> {
  const parsed = naParsedSchema.parse({
    checklistVersion: FIRE_CHECKLIST_VERSION,
    sectionId,
    reason,
    failedAttemptsBefore,
  });
  await write(db, sessionId, FIRE_OBSERVATION_TYPES.na, raw, parsed, seq);
  return { ok: true, outcome: { kind: "marked_na", sectionId, say: FIRE_COPY.markedNa(sectionTitle(sectionId)) } };
}

async function signOff(
  db: FireActionDb,
  ctx: { inspectionId: string; userId: string },
  action: Extract<FireAction, { action: "sign_off" }>,
  status: WalkthroughStatus,
  observations: Parameters<typeof newestSectionObservationAt>[0],
  seq: number,
): Promise<{ ok: true } | Extract<FireActionResult, { ok: false }>> {
  // A repeat sign-off while already validly signed returns the existing one.
  if (status.signoff.state === "signed") return { ok: true };
  if (!status.canSignOff) {
    return {
      ok: false,
      httpStatus: 422,
      body: {
        error: "Every section must be filled in or marked N/A before sign-off.",
        code: "SECTIONS_OPEN",
        openSectionIds: status.openSectionIds,
      },
    };
  }
  const sectionStates = Object.fromEntries(
    status.sections.map((s) => [s.sectionId, s.state === "na" ? "na" : "filled"]),
  );
  const parsed = signoffParsedSchema.parse({
    checklistVersion: FIRE_CHECKLIST_VERSION,
    typedName: action.typedName,
    declarationAccepted: action.declarationAccepted,
    signerUserId: ctx.userId,
    coversThrough: newestSectionObservationAt(observations)!,
    coveredRowIds: sectionObservationIds(FIRE_SECTION_IDS, observations),
    sectionStates,
  });
  await write(db, action.sessionId, FIRE_OBSERVATION_TYPES.signoff, FIRE_COPY.signoffDeclaration, parsed, seq);
  await db.auditLog.create({
    data: {
      inspectionId: ctx.inspectionId,
      action: "fire_walkthrough_signoff",
      entityType: "VoiceCopilotSession",
      entityId: action.sessionId,
      userId: ctx.userId,
      device: "Mobile",
      changes: JSON.stringify({
        checklistVersion: FIRE_CHECKLIST_VERSION,
        typedName: parsed.typedName,
        coversThrough: parsed.coversThrough,
        sections: FIRE_CHECKLIST.length,
        naSections: Object.values(sectionStates).filter((s) => s === "na").length,
      }),
    },
  });
  return { ok: true };
}
