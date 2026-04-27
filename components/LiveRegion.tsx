/**
 * RA-1572 — screen-reader status announcer.
 *
 * PM Round 4 flagged that loading spinners + toast notifications don't
 * announce themselves to assistive tech. This component renders a
 * visually-hidden `aria-live` region the app can write into.
 *
 * Pair with an imperative helper (`useAnnouncer`) so any handler can
 * announce without threading a ref:
 *
 *   const announce = useAnnouncer();
 *   // later:
 *   announce("Invoice saved");
 *
 * For urgent messages (errors) pass `{ assertive: true }` which
 * upgrades to `aria-live="assertive"`, interrupting the SR queue.
 */

"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

type AnnounceOptions = { assertive?: boolean };
type AnnouncerFn = (message: string, opts?: AnnounceOptions) => void;

const AnnouncerContext = createContext<AnnouncerFn | null>(null);

export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [politeMsg, setPoliteMsg] = useState("");
  const [assertiveMsg, setAssertiveMsg] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const announce = useCallback<AnnouncerFn>((message, opts) => {
    if (opts?.assertive) setAssertiveMsg(message);
    else setPoliteMsg(message);

    // Clear after a beat so repeated identical messages still announce.
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setPoliteMsg("");
      setAssertiveMsg("");
    }, 1500);
  }, []);

  return (
    <AnnouncerContext.Provider value={announce}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {politeMsg}
      </div>
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {assertiveMsg}
      </div>
    </AnnouncerContext.Provider>
  );
}

export function useAnnouncer(): AnnouncerFn {
  const ctx = useContext(AnnouncerContext);
  if (!ctx) {
    // No provider in this subtree — fall back to a no-op so components
    // can import unconditionally without throwing.
    return () => {};
  }
  return ctx;
}
