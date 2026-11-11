"use client";

/**
 * State and actions behind the fire walkthrough screen. The server decides
 * where an answer is filed and what is still open; this hook only sends the
 * technician's words and says what the server answered.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getFireSection } from "@/lib/voice/fire-smoke/checklist";
import { FIRE_COPY } from "@/lib/voice/fire-smoke/copy";
import { parseYesNo } from "@/lib/voice/fire-smoke/router";
import type { FireAction, FireActionResponse, FireWalkthroughResponse } from "@/lib/voice/fire-smoke/schema";
import { createKeyRing, getFireWalkthrough, postFireAction, startVoiceSession } from "./fire-client";
import { useFireSpeech } from "./use-fire-speech";

interface PendingAsk {
  // "section": is this answer part of the candidate section?
  // "na": close the whole candidate section as not applicable?
  mode: "section" | "na";
  transcript: string;
  candidateSectionId: string;
  say: string;
}

export function useFireWalkthrough(inspectionId: string, initial: FireWalkthroughResponse) {
  const [view, setView] = useState<FireWalkthroughResponse>(initial);
  const [currentSectionId, setCurrentSectionId] = useState<string | null>(initial.nextSectionId);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionFailed, setSessionFailed] = useState(false);
  const [say, setSay] = useState(initial.status.noticeAcknowledged ? `${FIRE_COPY.welcomeBack} ${initial.nextPrompt}` : "");
  const [ask, setAsk] = useState<PendingAsk | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [naFor, setNaFor] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [noticeSpoken, setNoticeSpoken] = useState(false);
  const keys = useRef(createKeyRing());
  const handleTextRef = useRef<(text: string) => void>(() => {});

  const speech = useFireSpeech({
    onFinal: (t) => handleTextRef.current(t),
    onBlocked: (reason) => setProblem(reason),
  });

  const talk = useCallback(
    (text: string, after?: () => void) => {
      setSay(text);
      speech.speak(text, after);
    },
    [speech],
  );

  const openSession = useCallback(async () => {
    setSessionFailed(false);
    const id = await startVoiceSession(inspectionId);
    if (id) setSessionId(id);
    else setSessionFailed(true);
  }, [inspectionId]);

  useEffect(() => {
    void openSession();
  }, [openSession]);

  const refresh = useCallback(async () => {
    const res = await getFireWalkthrough(inspectionId);
    if (res.ok) setView(res.data);
  }, [inspectionId]);

  /** Sends one action. Returns the new state, or null after saying why not. */
  const send = useCallback(
    async (action: FireAction, words?: string): Promise<FireActionResponse | null> => {
      setSaving(true);
      setProblem(null);
      speech.setBusy(true);
      const result = await postFireAction(inspectionId, action, keys.current.keyFor(action));
      setSaving(false);
      if (result.ok) {
        keys.current.settle(action);
        setView(result.data);
        if (words !== undefined) setTyped((t) => (t.trim() === words.trim() ? "" : t));
        speech.setBusy(false);
        return result.data;
      }
      // One rule for every failure (kind K11): words leave the typing box only
      // when the save succeeded, so a network drop and a server refusal both
      // keep what the technician said where they can correct and resend it.
      if (words !== undefined) setTyped(words);
      if (result.kind === "unconfirmed") {
        // Same key on retry, so a resend cannot double-file.
        talk(FIRE_COPY.saveFailed);
      } else {
        keys.current.settle(action);
        setProblem(result.message);
        // The job file changed since it was reviewed: show the new words so
        // the technician can read them before signing again.
        if (result.body?.code === "REVIEW_STALE") void refresh();
      }
      speech.setBusy(false);
      return null;
    },
    [inspectionId, refresh, speech, talk],
  );

  const moveTo = useCallback(
    (sectionId: string | null, prefix?: string) => {
      setCurrentSectionId(sectionId);
      const section = sectionId ? getFireSection(sectionId) : undefined;
      const next = section ? section.intro : FIRE_COPY.allDone;
      talk(prefix ? `${prefix} ${next}` : next);
    },
    [talk],
  );

  const handleOutcome = useCallback(
    (res: FireActionResponse, transcript: string) => {
      const outcome = res.outcome;
      if (!outcome) return;
      if (outcome.kind === "ask") {
        setAsk({ mode: "section", transcript, candidateSectionId: outcome.candidateSectionId, say: outcome.say });
        talk(outcome.say);
        return;
      }
      if (outcome.kind === "confirm_na") {
        setAsk({ mode: "na", transcript, candidateSectionId: outcome.sectionId, say: outcome.say });
        talk(outcome.say);
        return;
      }
      setAsk(null);
      if (outcome.kind === "marked_na") {
        setNaFor(null);
        moveTo(res.nextSectionId, outcome.say);
        return;
      }
      const allDone = res.status.openSectionIds.length === 0;
      talk(allDone ? `${outcome.say} ${FIRE_COPY.allDone}` : outcome.say);
    },
    [moveTo, talk],
  );

  const fileTo = useCallback(
    async (sectionId: string, transcript: string, routedBy: "technician_confirmed" | "technician_chose") => {
      if (!sessionId) return;
      const res = await send({ action: "file", sessionId, sectionId, transcript, routedBy }, transcript);
      if (res) {
        setPicking(null);
        setCurrentSectionId(sectionId);
        handleOutcome(res, transcript);
      }
    },
    [handleOutcome, send, sessionId],
  );

  const handleText = useCallback(
    async (text: string) => {
      const words = text.trim();
      if (!words || !sessionId || saving || !view.status.noticeAcknowledged) return;
      if (naFor) {
        const res = await send({ action: "mark_na", sessionId, sectionId: naFor, reason: words, failedAttemptsBefore: 0 }, words);
        if (res) handleOutcome(res, words);
        return;
      }
      if (ask) {
        const answer = parseYesNo(words);
        if (ask.mode === "na") {
          if (answer === "yes") {
            const res = await send(
              { action: "mark_na", sessionId, sectionId: ask.candidateSectionId, reason: ask.transcript, failedAttemptsBefore: 0 },
              ask.transcript,
            );
            if (res) handleOutcome(res, ask.transcript);
          } else if (answer === "no") {
            // Keep the words, and any hazard in them, as an entry in the section.
            await fileTo(ask.candidateSectionId, ask.transcript, "technician_chose");
          } else talk(ask.say);
          return;
        }
        if (answer === "yes") await fileTo(ask.candidateSectionId, ask.transcript, "technician_confirmed");
        else if (answer === "no") {
          setPicking(ask.transcript);
          setAsk(null);
          talk(FIRE_COPY.confirmNo);
        } else talk(ask.say);
        return;
      }
      if (picking) {
        talk(FIRE_COPY.confirmNo);
        return;
      }
      const res = await send(
        { action: "capture", sessionId, transcript: words, currentSectionId: currentSectionId ?? undefined },
        words,
      );
      if (res) handleOutcome(res, words);
    },
    [ask, currentSectionId, fileTo, handleOutcome, naFor, picking, saving, send, sessionId, talk, view.status.noticeAcknowledged],
  );
  handleTextRef.current = (t) => void handleText(t);

  const acknowledge = useCallback(async () => {
    if (!sessionId) return;
    const res = await send({
      action: "acknowledge_notice",
      sessionId,
      spoken: noticeSpoken,
      recognitionMode: speech.supported ? "unknown" : "typed",
    });
    if (!res) return;
    setCurrentSectionId(res.nextSectionId);
    // Listening starts only once Margot has finished speaking.
    talk(res.nextPrompt, () => {
      if (speech.supported) speech.setListeningWanted(true);
    });
  }, [noticeSpoken, send, sessionId, speech, talk]);

  const nextSection = useCallback(() => {
    const open = view.status.openSectionIds;
    moveTo(open.find((id) => id !== currentSectionId) ?? open[0] ?? null);
  }, [currentSectionId, moveTo, view.status.openSectionIds]);

  const signOff = useCallback(
    async (typedName: string) => {
      if (!sessionId) return;
      // The sign-off names the exact answers on screen; the server refuses it
      // if anything was saved since (kind K5).
      const res = await send({
        action: "sign_off",
        sessionId,
        typedName,
        declarationAccepted: true,
        reviewedRevision: view.status.reviewRevision,
      });
      if (res) talk(FIRE_COPY.signedOff);
    },
    [send, sessionId, talk, view.status.reviewRevision],
  );

  return {
    view,
    currentSectionId,
    sessionReady: sessionId !== null,
    sessionFailed,
    retrySession: openSession,
    say,
    ask,
    picking,
    naFor,
    typed,
    setTyped,
    saving,
    problem,
    speech,
    readNotice: () => talk(FIRE_COPY.notice, () => setNoticeSpoken(true)),
    acknowledge,
    submitTyped: () => handleTextRef.current(typed),
    answerAsk: (yes: boolean) => handleTextRef.current(yes ? "yes" : "no"),
    pick: (sectionId: string) => picking && void fileTo(sectionId, picking, "technician_chose"),
    cancelPick: () => setPicking(null),
    selectSection: (sectionId: string) => moveTo(sectionId),
    markNa: (sectionId: string) => {
      setCurrentSectionId(sectionId);
      setNaFor(sectionId);
      talk(FIRE_COPY.naAskReason);
    },
    nextSection,
    signOff,
  };
}
