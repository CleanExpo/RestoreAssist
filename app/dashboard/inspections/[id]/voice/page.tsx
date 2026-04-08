"use client";

/**
 * RA-396: Voice Copilot session UI — /dashboard/inspections/[id]/voice
 *
 * Uses Web Speech API (browser STT) for Phase 2 demo.
 * Phase 3 will replace with WhisperKit/Moonshine via Capacitor native plugin.
 */

import { useState, useEffect, useRef, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Mic,
  MicOff,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Circle,
  Volume2,
} from "lucide-react";
import type {
  VoiceSession,
  VoiceObservation,
  S500CompletionItem,
  VoiceCopilotMode,
} from "@/lib/voice/types";
import { cn } from "@/lib/utils";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function VoiceSessionPage({ params }: PageProps) {
  const { id: inspectionId } = use(params);
  const router = useRouter();

  const [mode, setMode] = useState<VoiceCopilotMode>("assisted");
  const [session, setSession] = useState<VoiceSession | null>(null);
  const [greeting, setGreeting] = useState<string>("");
  const [pendingItems, setPendingItems] = useState<S500CompletionItem[]>([]);
  const [observations, setObservations] = useState<VoiceObservation[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [copilotSpeech, setCopilotSpeech] = useState("");
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Speak text via TTS ──
  const speak = useCallback((text: string) => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
    }
    setCopilotSpeech(text);
  }, []);

  // ── Start session ──
  const startSession = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/inspections/${inspectionId}/voice/session`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode }),
        },
      );
      if (!res.ok) throw new Error("Failed to start session");
      const data = await res.json();
      setSession(data.session);
      setGreeting(data.greeting);
      setPendingItems(data.pendingItems);
      speak(data.greeting);
    } catch (e) {
      setError("Could not start voice session. Check your connection.");
    } finally {
      setStarting(false);
    }
  }, [inspectionId, mode, speak]);

  // ── Web Speech API setup ──
  const startListening = useCallback(() => {
    if (
      !("webkitSpeechRecognition" in window) &&
      !("SpeechRecognition" in window)
    ) {
      setError(
        "Your browser doesn't support voice input. Try Chrome on Android or Safari on iOS.",
      );
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition ||
      (
        window as unknown as {
          webkitSpeechRecognition: typeof window.SpeechRecognition;
        }
      ).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-AU";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);

    recognition.onresult = async (event) => {
      const result = event.results[event.results.length - 1];
      const transcript = result[0].transcript;
      setCurrentTranscript(transcript);

      if (result.isFinal && session) {
        setCurrentTranscript("");
        await submitObservation(session.sessionId, transcript);
      }
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      if (event.error !== "no-speech") {
        setError(`Mic error: ${event.error}`);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [session]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  // ── Submit observation ──
  const submitObservation = useCallback(
    async (sessionId: string, transcript: string) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/inspections/${inspectionId}/voice/observation`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId, transcript }),
          },
        );
        if (!res.ok) throw new Error("Failed to submit");
        const data = await res.json();

        setObservations((prev) => [data.observation, ...prev]);
        setPendingItems(data.updatedMissingItems);

        if (data.confirmationPrompt) {
          speak(data.confirmationPrompt);
        }
      } catch {
        speak("Sorry, I didn't catch that. Can you repeat?");
      } finally {
        setLoading(false);
      }
    },
    [inspectionId, speak],
  );

  // Scroll to top of observation feed on new entry
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [observations.length]);

  const criticalMissing = pendingItems.filter((i) => i.priority === 1);

  // ── Render ──
  return (
    <div className="flex flex-col h-screen bg-[#050505] text-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(`/dashboard/inspections/${inspectionId}`)}
          className="text-white/60 hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">Voice Copilot</p>
          <p className="text-xs text-white/50">IICRC S500:2025</p>
        </div>
        {session && (
          <Badge
            variant="outline"
            className="text-xs border-white/20 text-white/60"
          >
            {mode}
          </Badge>
        )}
      </div>

      {!session ? (
        /* ── Pre-session: mode selection ── */
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-2">
              Voice Copilot
            </h2>
            <p className="text-white/60 text-sm max-w-xs">
              Captures S500:2025 evidence hands-free while you work on site.
            </p>
          </div>

          <div className="w-full max-w-xs space-y-3">
            <p className="text-xs text-white/40 uppercase tracking-wider text-center">
              Mode
            </p>
            {(["guided", "assisted", "dictation"] as VoiceCopilotMode[]).map(
              (m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "w-full px-4 py-3 rounded-xl border text-sm text-left transition-colors",
                    mode === m
                      ? "border-[#D4A574] bg-[#D4A574]/10 text-white"
                      : "border-white/10 text-white/60 hover:border-white/30",
                  )}
                >
                  <span className="font-medium capitalize">{m}</span>
                  <span className="block text-xs mt-0.5 text-white/40">
                    {m === "guided" &&
                      "Step-by-step instructions — for newer techs"}
                    {m === "assisted" &&
                      "Prompts when needed — for experienced techs"}
                    {m === "dictation" &&
                      "Exceptions only — for senior operators"}
                  </span>
                </button>
              ),
            )}
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <Button
            onClick={startSession}
            disabled={starting}
            className="w-full max-w-xs bg-[#1C2E47] hover:bg-[#1C2E47]/80 text-white"
          >
            {starting ? "Starting…" : "Start Session"}
          </Button>
        </div>
      ) : (
        /* ── Active session ── */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Copilot speech bubble */}
          {copilotSpeech && (
            <div className="px-4 py-3 bg-[#1C2E47]/60 border-b border-white/10">
              <div className="flex items-start gap-2">
                <Volume2 className="h-4 w-4 text-[#D4A574] mt-0.5 shrink-0" />
                <p className="text-sm text-white/90">{copilotSpeech}</p>
              </div>
            </div>
          )}

          {/* Missing items summary */}
          {criticalMissing.length > 0 && (
            <div className="px-4 py-2 bg-amber-900/30 border-b border-amber-500/20">
              <p className="text-xs text-amber-300">
                {criticalMissing.length} critical item
                {criticalMissing.length !== 1 ? "s" : ""} needed before you
                leave site
              </p>
            </div>
          )}

          {/* Observations feed */}
          <ScrollArea
            className="flex-1 px-4"
            ref={scrollRef as React.RefObject<HTMLDivElement>}
          >
            <div className="py-4 space-y-2">
              {/* Live interim transcript */}
              {currentTranscript && (
                <Card className="p-3 bg-white/5 border-white/10">
                  <p className="text-sm text-white/40 italic">
                    {currentTranscript}…
                  </p>
                </Card>
              )}

              {observations.length === 0 && !currentTranscript && (
                <div className="text-center py-8 text-white/30 text-sm">
                  Tap the mic and start talking
                </div>
              )}

              {observations.map((obs) => (
                <Card key={obs.id} className="p-3 bg-white/5 border-white/10">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/90 truncate">
                        {obs.rawTranscript}
                      </p>
                      {obs.parsed.value !== undefined &&
                        obs.parsed.value !== null && (
                          <p className="text-xs text-[#D4A574] mt-0.5">
                            {obs.parsed.value}
                            {obs.parsed.unit === "%"
                              ? "%"
                              : ` ${obs.parsed.unit}`}
                            {obs.parsed.room ? ` — ${obs.parsed.room}` : ""}
                            {obs.parsed.material
                              ? ` · ${obs.parsed.material}`
                              : ""}
                          </p>
                        )}
                      {obs.parsed.s500Section && (
                        <p className="text-xs text-white/30 mt-0.5">
                          S500:2025 {obs.parsed.s500Section}
                        </p>
                      )}
                    </div>
                    <ConfidenceBadge
                      confidence={obs.confidence}
                      stored={!!obs.storedAt}
                    />
                  </div>
                </Card>
              ))}
            </div>
          </ScrollArea>

          {/* S500 checklist summary */}
          <div className="px-4 py-2 border-t border-white/10">
            <div className="flex gap-1 flex-wrap">
              {pendingItems.slice(0, 5).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-1 text-xs text-white/40"
                  title={item.label}
                >
                  {item.complete ? (
                    <CheckCircle2 className="h-3 w-3 text-green-400" />
                  ) : item.priority === 1 ? (
                    <AlertCircle className="h-3 w-3 text-amber-400" />
                  ) : (
                    <Circle className="h-3 w-3" />
                  )}
                  <span className="max-w-[80px] truncate">
                    {item.label.split(" ")[0]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Mic button */}
          <div className="flex justify-center py-6">
            <button
              onPointerDown={startListening}
              onPointerUp={stopListening}
              onPointerLeave={stopListening}
              disabled={loading}
              className={cn(
                "w-20 h-20 rounded-full flex items-center justify-center transition-all",
                isListening
                  ? "bg-red-500 scale-110 shadow-[0_0_30px_rgba(239,68,68,0.5)]"
                  : "bg-[#1C2E47] hover:bg-[#1C2E47]/80",
                loading && "opacity-50",
              )}
              aria-label={
                isListening ? "Recording — release to stop" : "Hold to speak"
              }
            >
              {isListening ? (
                <MicOff className="h-8 w-8 text-white" />
              ) : (
                <Mic className="h-8 w-8 text-white" />
              )}
            </button>
          </div>
          <p className="text-center text-xs text-white/30 pb-4">
            {isListening ? "Listening…" : "Hold to speak"}
          </p>
        </div>
      )}
    </div>
  );
}

function ConfidenceBadge({
  confidence,
  stored,
}: {
  confidence: "high" | "medium" | "low";
  stored: boolean;
}) {
  if (stored) {
    return <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />;
  }
  return (
    <span
      className={cn(
        "text-xs px-1.5 py-0.5 rounded shrink-0",
        confidence === "high" && "bg-green-900/40 text-green-400",
        confidence === "medium" && "bg-amber-900/40 text-amber-400",
        confidence === "low" && "bg-red-900/40 text-red-400",
      )}
    >
      {confidence}
    </span>
  );
}
