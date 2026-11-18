"use client";

/**
 * State and actions behind the fire walkthrough screen. The server decides
 * where an answer is filed and what is still open; this hook only sends the
 * technician's words and says what the server answered.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getFireSection, sectionSpeech } from "@/lib/voice/fire-smoke/checklist";
import { FIRE_COPY } from "@/lib/voice/fire-smoke/copy";
import { parseBareConfirmation } from "@/lib/voice/fire-smoke/router";
import type { FireAction, FireActionResponse, FireWalkthroughResponse } from "@/lib/voice/fire-smoke/schema";
import { getFireWalkthrough, newIdempotencyKey, postFireAction, startVoiceSession } from "./fire-client";
import { useFireSpeech } from "./use-fire-speech";

/** A save that has been sent and has no final reply yet (kind K12). */
interface HeldSave {
  readonly action: FireAction;
  readonly words?: string;
  readonly key: string;
  readonly onDone?: (res: FireActionResponse) => void;
}

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
  // A save was sent and its outcome is unconfirmed (kind K17, round 21).
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Words not filed anywhere yet. Durable: only restoring or discarding removes one.
  const [unsaved, setUnsaved] = useState<string[]>([]);
  const [noticeSpoken, setNoticeSpoken] = useState(false);
  const held = useRef<HeldSave | null>(null);
  // What the technician has in the typing box now, read after a save returns.
  const typedNow = useRef(typed);
  useEffect(() => {
    typedNow.current = typed;
  }, [typed]);
  const handleTextRef = useRef<(text: string) => void>(() => {});
  const holdBackRef = useRef<(words: string) => void>(() => {});

  const speech = useFireSpeech({
    onFinal: (t) => handleTextRef.current(t),
    // Words from a mic that was already stopped (a save paused it mid-sentence).
    onLate: (t) => holdBackRef.current(t),
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
    let id: string | null = null;
    try {
      id = await startVoiceSession(inspectionId);
    } catch {
      // Built never to throw; if it does, the retry control must still show.
      id = null;
    }
    if (id) setSessionId(id);
    else setSessionFailed(true);
  }, [inspectionId]);

  useEffect(() => {
    void openSession();
  }, [openSession]);

  // Nothing heard can be filed without a session, so listening is off while
  // there is none (the screen also disables the toggle until it is ready).
  const { wanted: listeningWanted, setListeningWanted } = speech;
  useEffect(() => {
    if (sessionFailed && listeningWanted) setListeningWanted(false);
  }, [listeningWanted, sessionFailed, setListeningWanted]);

  const refresh = useCallback(async () => {
    const res = await getFireWalkthrough(inspectionId);
    if (res.ok) setView(res.data);
  }, [inspectionId]);

  /**
   * Round 20, kind K17: the typing box belongs to the technician. Code may put
   * words in it only while it is empty (or already holds those words).
   * Returns false when the box holds other words and was left alone.
   */
  const offerWords = useCallback((words: string): boolean => {
    const now = typedNow.current;
    if (now.trim() !== "" && now.trim() !== words.trim()) return false;
    typedNow.current = words;
    setTyped(words);
    return true;
  }, []);

  /**
   * The one way words that are not filed yet are kept (kind: words held in a
   * transient mode must never vanish with it). They go to the typing box, or
   * are shown in the problem line when the box holds something else.
   */
  const setAside = useCallback((words: string) => {
    setUnsaved((list) => (list.includes(words) ? list : [...list, words]));
  }, []);
  const keepWords = useCallback(
    (words: string) => {
      if (offerWords(words)) return;
      setAside(words);
    },
    [offerWords, setAside],
  );

  /**
   * The one rule for words that arrive when they cannot be filed now (no voice
   * session, a save in flight or held, the notice not yet accepted, or a mic
   * already stopped). They are never dropped and never filed later on their
   * own: they go to "Words not saved". Words already sitting in the typing box
   * are already kept there, so they are not listed twice.
   */
  const holdBack = useCallback(
    (text: string) => {
      const words = text.trim();
      if (!words || typedNow.current.trim() === words) return;
      setAside(words);
    },
    [setAside],
  );
  holdBackRef.current = holdBack;

  /**
   * Delivers one frozen save (kind K12: its action, words and key never change
   * once made). Only a 2xx or a checked final refusal releases it. An
   * unconfirmed reply leaves it held and the screen pending: listening stays
   * paused and every input is locked until retry() gets it through.
   */
  const deliver = useCallback(
    async (save: HeldSave): Promise<void> => {
      held.current = save;
      setSaving(true);
      setProblem(null);
      speech.setBusy(true);
      let result: Awaited<ReturnType<typeof postFireAction>>;
      try {
        result = await postFireAction(inspectionId, save.action, save.key);
      } catch {
        // postFireAction is built never to throw; if it does, nothing proves the outcome.
        result = { ok: false, kind: "unconfirmed" };
      }
      // The screen always leaves "Saving" (round 15), whatever happens below.
      setSaving(false);
      if (!result.ok && result.kind === "unconfirmed") {
        setPending(true);
        if (save.words !== undefined) offerWords(save.words);
        talk(FIRE_COPY.saveFailed);
        return;
      }
      held.current = null;
      setPending(false);
      speech.setBusy(false);
      if (result.ok) {
        setView(result.data);
        const sent = save.words;
        if (sent !== undefined) setTyped((t) => (t.trim() === sent.trim() ? "" : t));
        save.onDone?.(result.data);
        return;
      }
      if (result.kind !== "refused") return;
      // Released by a final refusal: its words must stay visible somewhere.
      if (save.words !== undefined) keepWords(save.words);
      setProblem(result.message);
      // The job file changed since it was reviewed: show the new words so
      // the technician can read them before signing again.
      if (result.body?.code === "REVIEW_STALE") void refresh();
    },
    [inspectionId, keepWords, offerWords, refresh, speech, talk],
  );

  /**
   * Round 21, kind K17 (second instance): while a save is unconfirmed nothing
   * new can be given, so nothing new can be lost. A new save is refused, not
   * merged or queued; the only way forward is retry(), which re-sends the
   * frozen save with its own key.
   */
  const send = useCallback(
    async (action: FireAction, words?: string, onDone?: (res: FireActionResponse) => void): Promise<void> => {
      if (held.current) {
        if (words !== undefined) holdBack(words);
        talk(FIRE_COPY.retryFirst);
        return;
      }
      await deliver({ action, words, onDone, key: newIdempotencyKey() });
    },
    [deliver, holdBack, talk],
  );

  const retry = useCallback(async () => {
    if (held.current) await deliver(held.current);
  }, [deliver]);

  /** Every screen input that changes state goes through this (round 21). */
  const whenFree = useCallback(
    <A extends unknown[]>(fn: (...args: A) => void) =>
      (...args: A) => {
        if (held.current) {
          talk(FIRE_COPY.retryFirst);
          return;
        }
        fn(...args);
      },
    [talk],
  );

  const moveTo = useCallback(
    (sectionId: string | null, prefix?: string) => {
      setCurrentSectionId(sectionId);
      // An N/A reason being awaited belongs to the section it was asked for.
      setNaFor(null);
      const section = sectionId ? getFireSection(sectionId) : undefined;
      const next = section ? sectionSpeech(section) : FIRE_COPY.allDone;
      talk(prefix ? `${prefix} ${next}` : next);
    },
    [talk],
  );

  /**
   * One owner for every question or mode that belongs to the section on
   * screen (N/A reason, "is this part of...?", the section picker). Changing
   * section by the technician ends them all, so a later Yes or answer can
   * never be applied to the section they left. Words that were never filed
   * go back to the typing box (or, with "list", straight to the durable
   * "Words not saved" list), never lost.
   */
  const leaveSection = useCallback(
    (keepIn: "box" | "list" = "box") => {
      const unfiled = ask?.transcript ?? picking;
      setNaFor(null);
      if (ask === null && picking === null) return;
      setAsk(null);
      setPicking(null);
      if (!unfiled) return;
      if (keepIn === "box") keepWords(unfiled);
      else setAside(unfiled);
    },
    [ask, keepWords, picking, setAside],
  );

  /**
   * The one way the screen starts waiting for an N/A reason (RA-8321). While
   * it waits, the typed box and the next spoken words become the reason, so
   * nothing given before the question may be there: an open question's words
   * and whatever is already in the box go to the durable "Words not saved"
   * list, and the box starts empty. The reason is then only what the
   * technician gives after being asked.
   */
  const askNaReason = useCallback(
    (sectionId: string) => {
      leaveSection("list");
      const inBox = typedNow.current.trim();
      if (inBox) setAside(inBox);
      typedNow.current = "";
      setTyped("");
      setCurrentSectionId(sectionId);
      setNaFor(sectionId);
      talk(FIRE_COPY.naAskReason);
    },
    [leaveSection, setAside, talk],
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
      await send({ action: "file", sessionId, sectionId, transcript, routedBy }, transcript, (res) => {
        setPicking(null);
        setCurrentSectionId(sectionId);
        handleOutcome(res, transcript);
      });
    },
    [handleOutcome, send, sessionId],
  );

  const handleText = useCallback(
    async (text: string) => {
      const words = text.trim();
      if (!words) return;
      // No silent exit for real words (kind b): what cannot be filed now is kept.
      if (!sessionId || saving || held.current || !view.status.noticeAcknowledged) {
        holdBack(words);
        return;
      }
      // Only the section on screen can be the target of a pending N/A.
      if (naFor && naFor === currentSectionId) {
        await send({ action: "mark_na", sessionId, sectionId: naFor, reason: words, failedAttemptsBefore: 0 }, words, (res) =>
          handleOutcome(res, words),
        );
        return;
      }
      if (ask) {
        const answer = parseBareConfirmation(words);
        if (answer === null) {
          // Not a bare yes or no ("yes, and the ceiling is sagging"). Nothing
          // is cut out of it: the whole reply waits in the typing box and the
          // question stays open, so no word of it is lost or reversed.
          keepWords(words);
          talk(ask.say);
          return;
        }
        // A bare yes or no is a command, used once. If it came from the
        // typing box it leaves the box now: the save that follows carries the
        // question's words, not these, so nothing else would clear it and a
        // later Save answer would file "Yes" as an observation. Other words
        // in the box (with a spoken answer) are left alone.
        if (typedNow.current.trim() === words) {
          typedNow.current = "";
          setTyped("");
        }
        if (ask.mode === "na") {
          if (answer === "yes") {
            const reason = ask.transcript;
            await send(
              { action: "mark_na", sessionId, sectionId: ask.candidateSectionId, reason, failedAttemptsBefore: 0 },
              reason,
              (res) => handleOutcome(res, reason),
            );
          } else {
            // Keep the words, and any hazard in them, as an entry in the section.
            await fileTo(ask.candidateSectionId, ask.transcript, "technician_chose");
          }
          return;
        }
        if (answer === "yes") await fileTo(ask.candidateSectionId, ask.transcript, "technician_confirmed");
        else {
          setPicking(ask.transcript);
          setAsk(null);
          talk(FIRE_COPY.confirmNo);
        }
        return;
      }
      if (picking) {
        // Words spoken while the picker is open are kept, never dropped.
        keepWords(words);
        talk(FIRE_COPY.confirmNo);
        return;
      }
      await send(
        { action: "capture", sessionId, transcript: words, currentSectionId: currentSectionId ?? undefined },
        words,
        (res) => handleOutcome(res, words),
      );
    },
    [ask, currentSectionId, fileTo, handleOutcome, holdBack, keepWords, naFor, picking, saving, send, sessionId, talk, view.status.noticeAcknowledged],
  );
  handleTextRef.current = (t) => void handleText(t);

  const acknowledge = useCallback(async () => {
    if (!sessionId) return;
    const ack: FireAction = {
      action: "acknowledge_notice",
      sessionId,
      spoken: noticeSpoken,
      recognitionMode: speech.supported ? "unknown" : "typed",
    };
    await send(ack, undefined, (res) => {
      setCurrentSectionId(res.nextSectionId);
      // Listening starts by default only once Margot has finished speaking,
      // and only if the technician has not touched the toggle meanwhile:
      // an OFF chosen during the prompt stays OFF.
      const choicesBefore = speech.choiceCount();
      talk(res.nextPrompt, () => {
        if (speech.supported && speech.choiceCount() === choicesBefore) speech.setListeningWanted(true);
      });
    });
  }, [noticeSpoken, send, sessionId, speech, talk]);

  const nextSection = useCallback(() => {
    const open = view.status.openSectionIds;
    leaveSection();
    moveTo(open.find((id) => id !== currentSectionId) ?? open[0] ?? null);
  }, [currentSectionId, leaveSection, moveTo, view.status.openSectionIds]);

  const signOff = useCallback(
    async (typedName: string) => {
      if (!sessionId) return;
      // The sign-off names the exact answers on screen; the server refuses it
      // if anything was saved since (kind K5).
      const signing: FireAction = {
        action: "sign_off",
        sessionId,
        typedName,
        declarationAccepted: true,
        reviewedRevision: view.status.reviewRevision,
      };
      await send(signing, undefined, () => talk(FIRE_COPY.signedOff));
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
    // Only the section on screen can have an N/A reason pending.
    naFor: naFor === currentSectionId ? naFor : null,
    typed,
    setTyped: whenFree(setTyped),
    saving,
    pending,
    // Every input is locked while saving or while a save is unconfirmed.
    locked: saving || pending,
    retry,
    problem,
    speech,
    readNotice: () => talk(FIRE_COPY.notice, () => setNoticeSpoken(true)),
    acknowledge,
    submitTyped: whenFree(() => handleTextRef.current(typed)),
    answerAsk: whenFree((yes: boolean) => handleTextRef.current(yes ? "yes" : "no")),
    pick: whenFree((sectionId: string) => {
      if (picking) void fileTo(sectionId, picking, "technician_chose");
    }),
    unsaved,
    restoreUnsaved: whenFree((words: string) => {
      if (offerWords(words)) setUnsaved((list) => list.filter((w) => w !== words));
    }),
    discardUnsaved: whenFree((words: string) => setUnsaved((list) => list.filter((w) => w !== words))),
    cancelPick: whenFree(() => {
      if (picking) keepWords(picking);
      setPicking(null);
    }),
    selectSection: whenFree((sectionId: string) => {
      leaveSection();
      moveTo(sectionId);
    }),
    markNa: whenFree(askNaReason),
    nextSection: whenFree(nextSection),
    signOff: whenFree((name: string) => void signOff(name)),
  };
}
