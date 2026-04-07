/**
 * RA-396: VoiceSession state machine and in-memory store.
 *
 * Phase 2: Sessions are in-memory per server instance (no DB persistence).
 * Phase 3: Will use Redis for cross-instance session sharing.
 */

import { randomUUID } from "crypto";
import type {
  VoiceSession,
  VoiceCopilotMode,
  VoiceObservation,
  ObservationType,
  ParsedObservation,
  S500CompletionItem,
} from "./types";

// ─── In-memory session store ──────────────────────────────────────────────────
// Keyed by sessionId. Sessions expire after 4 hours (max inspection duration).

const SESSION_TTL_MS = 4 * 60 * 60 * 1000;

interface StoredSession {
  session: VoiceSession;
  expiresAt: number;
}

const sessions = new Map<string, StoredSession>();

// Cleanup expired sessions every 30 minutes
setInterval(() => {
  const now = Date.now();
  const expiredIds: string[] = [];
  sessions.forEach((stored, id) => {
    if (stored.expiresAt < now) expiredIds.push(id);
  });
  expiredIds.forEach((id) => sessions.delete(id));
}, 30 * 60 * 1000);

// ─── Session lifecycle ────────────────────────────────────────────────────────

export function createSession(
  inspectionId: string,
  userId: string,
  mode: VoiceCopilotMode = "assisted",
): VoiceSession {
  const session: VoiceSession = {
    sessionId: randomUUID(),
    inspectionId,
    userId,
    mode,
    state: "idle",
    startedAt: new Date().toISOString(),
    observations: [],
    missingItems: [],
  };

  sessions.set(session.sessionId, {
    session,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });

  return session;
}

export function getSession(sessionId: string): VoiceSession | null {
  const stored = sessions.get(sessionId);
  if (!stored) return null;
  if (stored.expiresAt < Date.now()) {
    sessions.delete(sessionId);
    return null;
  }
  return stored.session;
}

export function updateSessionState(
  sessionId: string,
  state: VoiceSession["state"],
): void {
  const stored = sessions.get(sessionId);
  if (stored) {
    stored.session.state = state;
    stored.expiresAt = Date.now() + SESSION_TTL_MS; // Reset TTL on activity
  }
}

export function addObservation(
  sessionId: string,
  type: ObservationType,
  rawTranscript: string,
  parsed: ParsedObservation,
  confidence: "high" | "medium" | "low",
  needsConfirmation: boolean,
): VoiceObservation | null {
  const stored = sessions.get(sessionId);
  if (!stored) return null;

  const observation: VoiceObservation = {
    id: randomUUID(),
    sessionId,
    rawTranscript,
    type,
    parsed,
    confidence,
    needsConfirmation,
    createdAt: new Date().toISOString(),
  };

  stored.session.observations.push(observation);
  return observation;
}

export function confirmObservation(
  sessionId: string,
  observationId: string,
): VoiceObservation | null {
  const stored = sessions.get(sessionId);
  if (!stored) return null;

  const obs = stored.session.observations.find((o) => o.id === observationId);
  if (!obs) return null;

  obs.confirmedAt = new Date().toISOString();
  obs.storedAt = new Date().toISOString();
  return obs;
}

export function updateMissingItems(
  sessionId: string,
  items: S500CompletionItem[],
): void {
  const stored = sessions.get(sessionId);
  if (stored) {
    stored.session.missingItems = items;
  }
}

export function endSession(sessionId: string): void {
  sessions.delete(sessionId);
}
