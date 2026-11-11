"use client";

/**
 * Speech for the fire walkthrough: Margot's voice (speech synthesis) and the
 * technician's (speech recognition), built on the browser Web Speech API.
 *
 * Rules this hook keeps:
 * - Listening is a tap toggle, not hold-to-talk (gloves on site).
 * - The toggle shows what recognition reports (onstart / onend), not what
 *   was asked for.
 * - Recognition is stopped while Margot speaks and resumes only after her
 *   utterance ends, so she is not recorded as the technician.
 * - A final transcript that repeats Margot's last prompt is dropped (echo).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { normaliseUtterance } from "@/lib/voice/fire-smoke/router";

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void;
  stop(): void;
};

type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** True when a transcript is Margot's own prompt heard back through the mic. */
export function isEcho(transcript: string, lastPrompt: string): boolean {
  const heard = normaliseUtterance(transcript).replace(/[^a-z0-9 ]/g, "");
  const said = normaliseUtterance(lastPrompt).replace(/[^a-z0-9 ]/g, "");
  if (!heard || !said) return false;
  if (heard === said) return true;
  return heard.split(" ").length >= 4 && said.includes(heard);
}

export interface FireSpeechHandlers {
  onFinal: (transcript: string) => void;
  onBlocked: (reason: string) => void;
}

export function useFireSpeech({ onFinal, onBlocked }: FireSpeechHandlers) {
  const [wanted, setWanted] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const supported = recognitionCtor() !== null;

  const recRef = useRef<Recognition | null>(null);
  const wantedRef = useRef(false);
  const speakingRef = useRef(false);
  const busyRef = useRef(false);
  const lastPromptRef = useRef("");
  const handlersRef = useRef({ onFinal, onBlocked });
  handlersRef.current = { onFinal, onBlocked };

  const startRecognition = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || !wantedRef.current || speakingRef.current || busyRef.current || recRef.current) return;
    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-AU";
    rec.maxAlternatives = 1;
    rec.onstart = () => setListening(true);
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      // Hands-free: carry on listening until the technician taps off.
      setTimeout(() => startRecognition(), 250);
    };
    rec.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      if (!result?.isFinal) return;
      const transcript = result[0]?.transcript?.trim() ?? "";
      if (!transcript || isEcho(transcript, lastPromptRef.current)) return;
      handlersRef.current.onFinal(transcript);
    };
    rec.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        wantedRef.current = false;
        setWanted(false);
        handlersRef.current.onBlocked("Microphone access was refused. You can still type your answers.");
      }
    };
    recRef.current = rec;
    try {
      rec.start();
    } catch {
      recRef.current = null;
    }
  }, []);

  const stopRecognition = useCallback(() => {
    const rec = recRef.current;
    if (rec) rec.stop();
  }, []);

  const speak = useCallback(
    (text: string, after?: () => void) => {
      lastPromptRef.current = text;
      stopRecognition();
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        speakingRef.current = false;
        setSpeaking(false);
        after?.();
        startRecognition();
      };
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        finish();
        return;
      }
      speakingRef.current = true;
      setSpeaking(true);
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-AU";
      utterance.rate = 0.95;
      utterance.onend = finish;
      utterance.onerror = finish;
      window.speechSynthesis.speak(utterance);
      // Some mobile browsers never fire onend; do not leave the mic stuck off.
      setTimeout(finish, text.split(/\s+/).length * 500 + 3000);
    },
    [startRecognition, stopRecognition],
  );

  const setListeningWanted = useCallback(
    (value: boolean) => {
      wantedRef.current = value;
      setWanted(value);
      if (value) startRecognition();
      else stopRecognition();
    },
    [startRecognition, stopRecognition],
  );

  /** While a save is in flight the mic is paused, so answers stay in order. */
  const setBusy = useCallback(
    (value: boolean) => {
      busyRef.current = value;
      if (value) stopRecognition();
      else startRecognition();
    },
    [startRecognition, stopRecognition],
  );

  useEffect(
    () => () => {
      wantedRef.current = false;
      recRef.current?.stop();
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    },
    [],
  );

  return { supported, wanted, listening, speaking, speak, setListeningWanted, setBusy };
}
