"use client";

/**
 * RA-7031 (RA-1132i) — Live Teacher panel container.
 *
 * Drives the existing backend: POST /api/live-teacher/session to open a session,
 * then POST /api/live-teacher/turn (SSE) per question. Renders the streamed
 * answer with clause citations via TranscriptStream. Text-first; browser Web
 * Speech (mic) + speechSynthesis (TTS) are progressive enhancements that only
 * appear when supported. No lucide imports (design-md-lint bans net-new icons).
 *
 * The /turn route is the real gate: it returns 402 { upgradeRequired: true } for
 * an inactive subscription, or 402 PAYMENT_REQUIRED when the workspace has no
 * Anthropic (BYOK) key. Each maps to a distinct call-to-action here.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { TranscriptStream } from "./TranscriptStream";
import {
  streamTurn,
  type LiveTeacherToolCall,
  type TranscriptTurn,
} from "@/lib/live-teacher/turn-stream";

type Jurisdiction = "AU" | "NZ";
type Gate = "subscription" | "byok";

interface VoiceAssistantProps {
  inspectionId: string;
  jurisdiction?: Jurisdiction;
}

interface MinimalRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult:
    | ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void)
    | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function getRecognitionCtor(): (new () => MinimalRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => MinimalRecognition;
    webkitSpeechRecognition?: new () => MinimalRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function VoiceAssistant({
  inspectionId,
  jurisdiction = "AU",
}: VoiceAssistantProps) {
  const router = useRouter();
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [gate, setGate] = useState<Gate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speakReplies, setSpeakReplies] = useState(false);
  const [listening, setListening] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);

  const sessionRef = useRef<string | null>(null);
  const idRef = useRef(0);
  const recognitionRef = useRef<MinimalRecognition | null>(null);

  useEffect(() => {
    setMicSupported(getRecognitionCtor() !== null);
    setTtsSupported(
      typeof window !== "undefined" && "speechSynthesis" in window,
    );
  }, []);

  const nextId = () => `t${(idRef.current += 1)}`;

  const patchTurn = useCallback(
    (id: string, patch: Partial<TranscriptTurn>) => {
      setTurns((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      );
    },
    [],
  );

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = jurisdiction === "NZ" ? "en-NZ" : "en-AU";
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    },
    [jurisdiction],
  );

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionRef.current) return sessionRef.current;
    const res = await fetch("/api/live-teacher/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inspectionId,
        jurisdiction,
        deviceOs: "web",
        hadLidar: false,
      }),
    });
    if (!res.ok) {
      throw new Error(
        res.status === 404
          ? "This inspection could not be found."
          : "Could not start a Live Teacher session.",
      );
    }
    const body = await res.json();
    const sid = body?.data?.sessionId as string | undefined;
    if (!sid) throw new Error("Could not start a Live Teacher session.");
    sessionRef.current = sid;
    return sid;
  }, [inspectionId, jurisdiction]);

  const send = useCallback(async () => {
    const utterance = input.trim();
    if (!utterance || busy) return;
    setError(null);
    setGate(null);

    const userId = nextId();
    const assistantId = nextId();
    setTurns((prev) => [
      ...prev,
      { id: userId, role: "user", content: utterance },
      { id: assistantId, role: "assistant", content: "", pending: true },
    ]);
    setInput("");
    setBusy(true);

    try {
      const sid = await ensureSession();
      const res = await fetch("/api/live-teacher/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid, utterance }),
      });

      if (!res.ok) {
        if (res.status === 402) {
          const body = await res.json().catch(() => ({}));
          setGate(body?.upgradeRequired ? "subscription" : "byok");
          setTurns((prev) =>
            prev.filter((t) => t.id !== assistantId && t.id !== userId),
          );
          return;
        }
        throw new Error("The Live Teacher could not answer. Please try again.");
      }

      let latest = "";
      const toolCalls: LiveTeacherToolCall[] = [];
      await streamTurn(res, (event) => {
        if (event.type === "token") {
          latest = event.content;
          patchTurn(assistantId, { content: event.content });
        } else if (event.type === "tool_call") {
          toolCalls.push({
            id: event.id,
            toolName: event.toolName,
            ok: event.ok,
            result: event.result,
            error: event.error,
          });
          patchTurn(assistantId, { toolCalls: [...toolCalls] });
        } else if (event.type === "done") {
          patchTurn(assistantId, {
            clauseRefs: event.clauseRefs,
            confidence: event.confidence,
            pending: false,
          });
          if (speakReplies && latest) speak(latest);
        } else if (event.type === "error") {
          patchTurn(assistantId, {
            content: "Sorry — something went wrong mid-answer.",
            pending: false,
          });
        }
      });
    } catch (e) {
      // Preserve the assistant turn if it already shows real state — streamed
      // content OR a persisted tool action. Dropping it would hide a reading
      // that was actually logged server-side and invite the tech to re-enter it
      // (a duplicate). Only discard an empty placeholder.
      setTurns((prev) =>
        prev.flatMap((t) => {
          if (t.id !== assistantId) return [t];
          if (t.content || (t.toolCalls && t.toolCalls.length > 0)) {
            return [{ ...t, pending: false }];
          }
          return [];
        }),
      );
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }, [input, busy, ensureSession, patchTurn, speakReplies, speak]);

  const toggleMic = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = jurisdiction === "NZ" ? "en-NZ" : "en-AU";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript ?? "";
      if (transcript) setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }, [listening, jurisdiction]);

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
            Live Teacher{" "}
            <span className="align-middle text-xs font-medium text-[#8A6B4E] dark:text-[#D4A574]">
              Preview
            </span>
          </h2>
          <p className="text-xs text-neutral-500 dark:text-slate-400">
            Grounded in Australian restoration standards. Answers cite the clause;
            you stay the decision-maker.
          </p>
        </div>
        {ttsSupported && (
          <label className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-slate-400">
            <input
              type="checkbox"
              checked={speakReplies}
              onChange={(e) => setSpeakReplies(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Read replies aloud
          </label>
        )}
      </div>

      {gate === "subscription" && (
        <Card className="border-amber-300 bg-amber-50/60 p-3 dark:border-amber-800/50 dark:bg-amber-900/10">
          <p className="text-sm text-neutral-700 dark:text-slate-200">
            Live Teacher needs an active RestoreAssist subscription.
          </p>
          <Button
            size="sm"
            className="mt-2"
            onClick={() => router.push("/dashboard/pricing")}
          >
            View plans
          </Button>
        </Card>
      )}

      {gate === "byok" && (
        <Card className="border-amber-300 bg-amber-50/60 p-3 dark:border-amber-800/50 dark:bg-amber-900/10">
          <p className="text-sm text-neutral-700 dark:text-slate-200">
            Live Teacher uses your workspace&rsquo;s own Anthropic API key. Add one
            to continue.
          </p>
          <Button
            size="sm"
            className="mt-2"
            onClick={() => router.push("/dashboard/settings/ai-providers")}
          >
            Add Anthropic key
          </Button>
        </Card>
      )}

      <div className="rounded-xl border border-neutral-200 dark:border-slate-700/60">
        <TranscriptStream turns={turns} />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex items-end gap-2">
        {micSupported && (
          <Button
            type="button"
            variant={listening ? "default" : "outline"}
            size="sm"
            aria-pressed={listening}
            aria-label={listening ? "Stop listening" : "Start voice input"}
            onClick={toggleMic}
            className={cn(listening && "animate-pulse")}
          >
            {listening ? "Listening" : "Speak"}
          </Button>
        )}
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Ask about classification, drying, scope, or S500 guidance…"
          aria-label="Ask the Live Teacher"
          rows={2}
          className="flex-1 resize-none"
        />
        <Button
          type="button"
          onClick={() => void send()}
          disabled={busy || input.trim().length === 0}
        >
          {busy ? "Asking…" : "Ask"}
        </Button>
      </div>
    </Card>
  );
}
