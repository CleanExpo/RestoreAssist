"use client";

/**
 * RA-1122 — Voice-to-text mic button for narrative fields.
 *
 * Workflow:
 *   1. Tap mic → MediaRecorder starts (webm/opus by default)
 *   2. Tap stop → blob uploaded to /api/ai/voice-note-transcribe (Whisper)
 *   3. Transcript returned → passed to onTranscript callback
 *   4. On server 503 (no OPENAI_API_KEY), falls back to Web Speech API
 *      if the browser supports it (Chrome/Edge/Safari desktop, not mobile
 *      Firefox). Signals via onTranscriptStatus so caller can inform user.
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
  /** When provided, audio is queued offline tagged to this inspection — RA-1609 */
  inspectionId?: string;
  /** Human label for the field (shows in the pending-transcripts UI) */
  fieldLabel?: string;
}

export function VoiceNoteButton({
  onTranscript,
  onStatusChange,
  disabled,
  maxSeconds = 90,
  compact = false,
  inspectionId,
  fieldLabel,
}: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
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
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
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

    try {
      const form = new FormData();
      form.append("audio", blob, "voice-note.webm");
      const res = await fetch("/api/ai/voice-note-transcribe", {
        method: "POST",
        body: form,
      });

      if (res.status === 503) {
        // Server has no Whisper key — try Web Speech API fallback
        await webSpeechFallback(blob);
        return;
      }

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      const data = (await res.json()) as { transcript?: string };
      if (!data.transcript) throw new Error("Empty transcript");
      onTranscript(data.transcript.trim());
    } catch {
      // Likely a network error (fetch itself threw — truly offline).
      // Queue the blob for transcription on reconnect (RA-1609).
      try {
        await queueVoiceNote({
          blob: new Blob(chunksRef.current, { type: "audio/webm" }),
          mimeType: "audio/webm",
          inspectionId,
          fieldLabel,
        });
        setError("Offline — voice note queued. Will transcribe on reconnect.");
      } catch {
        setError("Transcription failed. Check your connection and try again.");
      }
    } finally {
      setStatus("idle");
    }
  }

  async function webSpeechFallback(blob: Blob) {
    // Server has no OPENAI_API_KEY — offline or unconfigured.
    // Queue the audio blob (RA-1609); it will be transcribed on reconnect.
    if (!navigator.onLine) {
      try {
        await queueVoiceNote({
          blob,
          mimeType: "audio/webm",
          inspectionId,
          fieldLabel,
        });
        setError(
          "Offline — voice note queued. It will be transcribed when you reconnect.",
        );
      } catch {
        setError(
          "Voice transcription is unavailable offline. Try again when connected, or type your note.",
        );
      }
    } else {
      setError(
        "Voice transcription is unavailable — API key not configured. Please type your note.",
      );
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
    </div>
  );
}
