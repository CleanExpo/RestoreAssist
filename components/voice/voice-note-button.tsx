"use client";

/**
 * RA-1122 — Voice-to-text mic button for narrative fields.
 *
 * Workflow:
 *   1. Tap mic → MediaRecorder starts (webm/opus by default)
 *   2. Tap stop → blob uploaded to /api/ai/voice-note-transcribe (Whisper)
 *   3. Transcript returned → passed to onTranscript callback
 *   4. RA-1609: if offline, or the upload fails with a 503 or network
 *      error, the blob is queued (lib/voice-note-queue.ts) instead of
 *      hard-failing — it's drained and transcribed automatically once
 *      connectivity returns (see components/nir-offline-provider.tsx).
 *
 * Keeps state simple: idle → recording → uploading → done.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getPendingTranscripts,
  markTranscriptConsumed,
  queueVoiceNote,
  VOICE_NOTES_DRAINED_EVENT,
} from "@/lib/voice-note-queue";
import {
  mapVoiceTranscriptToFields,
  type VoiceFieldMapping,
} from "@/lib/services/ai/voice-to-fields";

type Status = "idle" | "recording" | "uploading";

interface Props {
  onTranscript: (transcript: string) => void;
  onStatusChange?: (status: Status) => void;
  /**
   * RA-7051: fired when the transcribe route returns 402 (workspace has no
   * OpenAI key). Lets the caller fall back to another capture tier (e.g. the
   * browser Web Speech mic) instead of showing a dead-end error. Additive —
   * callers that don't pass it keep the existing error behaviour.
   */
  onUnavailable?: () => void;
  disabled?: boolean;
  /** Max recording duration before auto-stop; default 90 s. */
  maxSeconds?: number;
  /** Compact mode hides the status label. */
  compact?: boolean;
  /** Inspection this note belongs to — tags the queue entry (RA-1609). */
  inspectionId?: string;
  /** Which field the note is for — tags the queue entry (RA-1609). */
  fieldLabel?: string;
  /**
   * Room this control is showing. Captured when recording starts so a later
   * room switch cannot move the note. A drained note for another room stays
   * queued until that room is open.
   */
  roomId?: string;
  /** RA-7613 — structured mapping of the transcript onto enumerated fields. */
  onMappedFields?: (
    mapping: VoiceFieldMapping,
    context?: { roomId?: string },
  ) => void;
}

export function VoiceNoteButton({
  onTranscript,
  onStatusChange,
  onUnavailable,
  disabled,
  maxSeconds = 90,
  compact = false,
  inspectionId = "unassigned",
  fieldLabel = "voice-note",
  roomId,
  onMappedFields,
}: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const [mapping, setMapping] = useState<VoiceFieldMapping | null>(null);
  const [mappingNote, setMappingNote] = useState<string | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const onMappedFieldsRef = useRef(onMappedFields);
  const consumedIdsRef = useRef(new Set<string>());
  onTranscriptRef.current = onTranscript;
  onMappedFieldsRef.current = onMappedFields;
  const recorderRef = useRef<MediaRecorder | null>(null);
  /** Room id at the moment recording started. Not the room open at upload time. */
  const recordedRoomIdRef = useRef<string | undefined>(roomId);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Expose status to parent
  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  // Queued notes are transcribed on reconnect. Deliver that transcript to the
  // same mapping callback, or say plainly that mapping was skipped.
  useEffect(() => {
    let cancelled = false;

    async function consumeDrained() {
      // A partial test mock of the queue module throws on a missing export.
      // Treat that the same as "nothing queued" so the mic still works.
      let readPending: typeof getPendingTranscripts;
      try {
        readPending = getPendingTranscripts;
      } catch {
        return;
      }
      if (typeof readPending !== "function") return;
      let pending: Awaited<ReturnType<typeof getPendingTranscripts>> = [];
      try {
        pending = await readPending();
      } catch {
        if (!cancelled) {
          setMappingNote(
            "Queued voice note could not be read. Mapping was skipped.",
          );
        }
        return;
      }
      if (cancelled) return;

      for (const item of pending) {
        if (
          item.inspectionId !== inspectionId ||
          item.fieldLabel !== fieldLabel
        ) {
          continue;
        }
        // A note recorded in another room stays queued until that room is open.
        if (item.roomId && roomId && item.roomId !== roomId) {
          continue;
        }
        if (consumedIdsRef.current.has(item.id)) continue;
        consumedIdsRef.current.add(item.id);

        if (item.status === "error" || !item.transcript?.trim()) {
          setMappingNote(
            item.error
              ? `Queued voice note failed: ${item.error}. Mapping was skipped.`
              : "Queued voice note had no words. Mapping was skipped.",
          );
          await markConsumed(item.id);
          continue;
        }

        const transcript = item.transcript.trim();
        const handler = onMappedFieldsRef.current;
        if (!handler) {
          onTranscriptRef.current(transcript);
          setMappingNote(
            "Voice note transcribed. Mapping onto job fields was skipped.",
          );
        } else {
          const mapped = mapVoiceTranscriptToFields(transcript);
          const noteRoomId = item.roomId ?? roomId;
          setMapping(mapped);
          handler(mapped, noteRoomId ? { roomId: noteRoomId } : undefined);
          onTranscriptRef.current(transcript);
          setQueued(false);
          setMappingNote(null);
        }
        await markConsumed(item.id);
      }
    }

    async function markConsumed(id: string) {
      try {
        if (typeof markTranscriptConsumed === "function") {
          await markTranscriptConsumed(id);
        }
      } catch {
        // Partial queue mock, or the row was already gone.
      }
    }

    void consumeDrained();
    let drainedEvent = "ra-voice-notes-drained";
    try {
      if (VOICE_NOTES_DRAINED_EVENT) drainedEvent = VOICE_NOTES_DRAINED_EVENT;
    } catch {
      // Partial queue mock — keep the stable event name.
    }
    const onDrained = () => {
      void consumeDrained();
    };
    window.addEventListener(drainedEvent, onDrained);
    return () => {
      cancelled = true;
      window.removeEventListener(drainedEvent, onDrained);
    };
  }, [inspectionId, fieldLabel, roomId]);

  // Cleanup on unmount
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  async function start() {
    recordedRoomIdRef.current = roomId;
    setError(null);
    setQueued(false);
    setMapping(null);
    try {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        throw new Error("Microphone access not supported in this browser");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        void upload();
      };

      recorder.start();
      setStatus("recording");

      // Auto-stop at maxSeconds
      timerRef.current = setTimeout(() => {
        if (recorderRef.current?.state === "recording") {
          recorderRef.current.stop();
        }
      }, maxSeconds * 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Microphone denied";
      setError(msg);
      setStatus("idle");
    }
  }

  function stop() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
      if (timerRef.current) clearTimeout(timerRef.current);
    }
  }

  async function upload() {
    const recordedRoomId = recordedRoomIdRef.current;
    setStatus("uploading");
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await queueForLater(blob, recordedRoomId);
      return;
    }

    try {
      const form = new FormData();
      form.append("audio", blob, "voice-note.webm");
      const res = await fetch("/api/ai/voice-note-transcribe", {
        method: "POST",
        body: form,
      });

      if (res.status === 503) {
        // Transient upstream unavailability — queue and retry on reconnect.
        await queueForLater(blob, recordedRoomId);
        return;
      }

      if (res.status === 402) {
        // The transcribe route returns 402 for TWO distinct cases:
        //  - no workspace OpenAI key -> { error: { code: "PAYMENT_REQUIRED" } }
        //    (RA-7051): hand off to the caller's fallback tier (e.g. Web Speech)
        //    rather than surfacing a dead-end.
        //  - inactive subscription  -> { upgradeRequired: true }: a real block,
        //    surfaced as the normal error — a mic downgrade would hide it.
        const body = (await res.json().catch(() => ({}))) as {
          error?: string | { code?: string; message?: string };
          upgradeRequired?: boolean;
        };
        const code = typeof body.error === "object" ? body.error?.code : undefined;
        if (code === "PAYMENT_REQUIRED" && onUnavailable) {
          onUnavailable();
          setStatus("idle");
          return;
        }
        const msg =
          typeof body.error === "string"
            ? body.error
            : body.error?.message || "Active subscription required";
        throw new Error(msg);
      }

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      const data = (await res.json()) as { transcript?: string };
      if (!data.transcript) throw new Error("Empty transcript");
      const transcript = data.transcript.trim();
      const mapped = mapVoiceTranscriptToFields(transcript);
      setMapping(mapped);
      onMappedFieldsRef.current?.(
        mapped,
        recordedRoomId ? { roomId: recordedRoomId } : undefined,
      );
      onTranscript(transcript);
      setStatus("idle");
    } catch (err) {
      if (err instanceof TypeError) {
        // fetch() throws TypeError on network failure (offline mid-flight,
        // DNS/connection drop) — queue instead of hard-failing.
        await queueForLater(blob, recordedRoomId);
        return;
      }
      const msg = err instanceof Error ? err.message : "Transcription failed";
      setError(msg);
      setStatus("idle");
    }
  }

  /** RA-1609: queue the recorded blob for transcription on reconnect. */
  async function queueForLater(blob: Blob, recordedRoomId?: string) {
    try {
      await queueVoiceNote(blob, {
        inspectionId,
        fieldLabel,
        ...(recordedRoomId ? { roomId: recordedRoomId } : {}),
      });
      setQueued(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to queue voice note";
      setError(msg);
    } finally {
      setStatus("idle");
    }
  }

  const recording = status === "recording";
  const uploading = status === "uploading";

  return (
    <div className={cn("inline-flex items-center gap-2", compact && "gap-1")}>
      <Button
        type="button"
        variant={recording ? "destructive" : "outline"}
        size={compact ? "sm" : "default"}
        onClick={recording ? stop : start}
        disabled={disabled || uploading}
        aria-label={recording ? "Stop recording" : "Start voice note"}
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : recording ? (
          <Square className="h-4 w-4" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
        {!compact && (
          <span className="ml-2">
            {recording ? "Stop" : uploading ? "Transcribing…" : "Voice note"}
          </span>
        )}
      </Button>
      {error && (
        <span className="text-xs text-destructive max-w-[200px]">{error}</span>
      )}
      {!error && queued && (
        <span className="text-xs text-muted-foreground max-w-[200px]">
          Queued — will transcribe when back online.
        </span>
      )}
      {mappingNote && (
        <span className="text-xs text-muted-foreground max-w-[220px]">
          {mappingNote}
        </span>
      )}
      {!onMappedFields && mapping && (mapping.material || mapping.waterCategory || mapping.dimensions || mapping.needsConfirmation.length > 0) && (
        <div className="text-xs text-muted-foreground max-w-[280px] space-y-1">
          {mapping.material && (
            <p>Material: {mapping.material.name}</p>
          )}
          {mapping.waterCategory && (
            <p>Water category: {mapping.waterCategory}</p>
          )}
          {mapping.dimensions && (
            <p>
              Dimensions: {mapping.dimensions.lengthM}
              {mapping.dimensions.widthM != null
                ? ` × ${mapping.dimensions.widthM}`
                : ""}{" "}
              m
            </p>
          )}
          {mapping.needsConfirmation.map((item) => (
            <p key={`${item.kind}-${item.term}`} className="text-amber-700">
              Confirm {item.kind}: "{item.term}" does not match a known value.
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
