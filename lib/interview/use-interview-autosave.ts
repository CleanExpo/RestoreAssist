/**
 * RA-1213: debounced autosave for guided interview answers.
 *
 * Each answered question is already persisted individually via
 * POST /api/forms/interview/answer. This hook layers a safety-net
 * session-level snapshot on top:
 *   - writes the latest answers map to localStorage immediately
 *     (so an offline / crashed browser can still recover)
 *   - 2s debounce, then PATCH /api/interviews/:id with the snapshot
 *     stashed in autoPopulatedFields JSON (no schema change)
 *   - exposes a 3-state indicator: "saving" | "saved" | "error"
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { InterviewQuestionAnswer } from "@/components/forms/guided-interview";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 2000;
const MAX_RETRIES = 3;

export function interviewStorageKey(sessionId: string): string {
  return `ra-interview-autosave:${sessionId}`;
}

interface SnapshotPayload {
  sessionId: string;
  answers: InterviewQuestionAnswer[];
  savedAt: string;
}

function writeLocalSnapshot(snapshot: SnapshotPayload): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      interviewStorageKey(snapshot.sessionId),
      JSON.stringify(snapshot),
    );
  } catch {
    // localStorage can throw in private mode / quota exceeded; non-fatal.
  }
}

export function clearLocalSnapshot(sessionId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(interviewStorageKey(sessionId));
  } catch {
    // non-fatal
  }
}

export function readLocalSnapshot(sessionId: string): SnapshotPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(interviewStorageKey(sessionId));
    if (!raw) return null;
    return JSON.parse(raw) as SnapshotPayload;
  } catch {
    return null;
  }
}

export interface UseInterviewAutosaveResult {
  status: AutosaveStatus;
  lastSavedAt: Date | null;
  /** Push a new answers snapshot. Debounced; local snapshot is immediate. */
  enqueue: (sessionId: string, answers: InterviewQuestionAnswer[]) => void;
}

export function useInterviewAutosave(): UseInterviewAutosaveResult {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<SnapshotPayload | null>(null);
  const inFlightRef = useRef<AbortController | null>(null);

  const flush = useCallback(async (attempt = 0): Promise<void> => {
    const snapshot = pendingRef.current;
    if (!snapshot) return;

    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;

    setStatus("saving");
    try {
      const res = await fetch(`/api/interviews/${snapshot.sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          autoPopulatedFields: {
            __autosave: {
              savedAt: snapshot.savedAt,
              answers: snapshot.answers,
            },
          },
        }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`PATCH failed: ${res.status}`);

      pendingRef.current = null;
      setStatus("saved");
      setLastSavedAt(new Date(snapshot.savedAt));
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      if (attempt + 1 < MAX_RETRIES) {
        setStatus("error");
        // exponential backoff: 2s, 4s, 8s
        const backoff = DEBOUNCE_MS * Math.pow(2, attempt);
        setTimeout(() => {
          void flush(attempt + 1);
        }, backoff);
      } else {
        setStatus("error");
      }
    }
  }, []);

  const enqueue = useCallback(
    (sessionId: string, answers: InterviewQuestionAnswer[]) => {
      const snapshot: SnapshotPayload = {
        sessionId,
        answers,
        savedAt: new Date().toISOString(),
      };

      // localStorage write is synchronous & immediate (offline safety net).
      writeLocalSnapshot(snapshot);
      pendingRef.current = snapshot;
      setStatus("saving");

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void flush(0);
      }, DEBOUNCE_MS);
    },
    [flush],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      inFlightRef.current?.abort();
    };
  }, []);

  return { status, lastSavedAt, enqueue };
}
