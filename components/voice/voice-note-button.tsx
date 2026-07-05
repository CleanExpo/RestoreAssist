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
import { queueVoiceNote } from "@/lib/voice-note-queue";

type Status = "idle" | "recording" | "uploading";

interface Props {
  onTranscript: (transcript: string) => void;
  onStatusChange?: (status: Status) => void;
  disabled?: boolean;
  /** Max recording duration before auto-stop; default 90 s. */
  maxSeconds?: number;
  /** Compact mode hides the status label. */
  compact?: boolean;
  /** Inspection this note belongs to — tags the queue entry (RA-1609). */
  inspectionId?: string;
  /** Which field the note is for — tags the queue entry (RA-1609). */
  fieldLabel?: string;
}

export function VoiceNoteButton({
  onTranscript,
  onStatusChange,
  disabled,
  maxSeconds = 90,
  compact = false,
  inspectionId = "unassigned",
  fieldLabel = "voice-note",
}: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Expose status to parent
  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  // Cleanup on unmount
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  async function start() {
    setError(null);
    setQueued(false);
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
    setStatus("uploading");
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await queueForLater(blob);
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
        await queueForLater(blob);
        return;
      }

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      const data = (await res.json()) as { transcript?: string };
      if (!data.transcript) throw new Error("Empty transcript");
      onTranscript(data.transcript.trim());
      setStatus("idle");
    } catch (err) {
      if (err instanceof TypeError) {
        // fetch() throws TypeError on network failure (offline mid-flight,
        // DNS/connection drop) — queue instead of hard-failing.
        await queueForLater(blob);
        return;
      }
      const msg = err instanceof Error ? err.message : "Transcription failed";
      setError(msg);
      setStatus("idle");
    }
  }

  /** RA-1609: queue the recorded blob for transcription on reconnect. */
  async function queueForLater(blob: Blob) {
    try {
      await queueVoiceNote(blob, { inspectionId, fieldLabel });
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
    </div>
  );
}
