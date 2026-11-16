/**
 * RA-8397 — one shared guard against losing typed work.
 *
 * Before this hook, the web app had no "you have unsaved changes" warning on
 * any screen, and the defect was fixed one form at a time (RA-1213, RA-7763,
 * RA-8322, RA-8334). `scripts/check-unsaved-changes-guard.mjs` now fails CI
 * when a long form does not use this hook, so the fix lives in one place.
 *
 * It covers two ways of leaving:
 *   - tab close and refresh: a `beforeunload` handler, registered only while
 *     the form is dirty, so the browser shows its own leave prompt;
 *   - in-app leave (Cancel, a back link): `confirmLeave()` asks through the
 *     shared ConfirmDialog and resolves true when it is safe to go.
 *
 * Usage:
 *
 *   const guard = useUnsavedChangesGuard(isDirty);
 *   // render: <guard.Mount />
 *   // Cancel: if (await guard.confirmLeave()) router.push("/somewhere");
 *   // after a successful save, before redirecting: guard.markSaved();
 *   // markSaved() disarms the guard for the rest of this mount; the page is
 *   // expected to redirect away after a save.
 */

"use client";

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { useConfirmDialog } from "@/components/ConfirmDialog";

export interface UnsavedChangesGuard {
  /** Resolves true when leaving is safe: nothing typed, or the person confirmed. */
  confirmLeave: () => Promise<boolean>;
  /** Call after a successful save so the redirect that follows does not warn. */
  markSaved: () => void;
  /** Render once in the form so the in-app confirm step can appear. */
  Mount: () => ReactElement | null;
}

export function useUnsavedChangesGuard(isDirty: boolean): UnsavedChangesGuard {
  const confirm = useConfirmDialog();
  const [saved, setSaved] = useState(false);
  // A ref as well as state: markSaved() is usually followed by router.push in
  // the same tick, before a re-render could read the new state.
  const savedRef = useRef(false);

  const shouldWarn = isDirty && !saved;

  useEffect(() => {
    if (!shouldWarn) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (savedRef.current) return;
      event.preventDefault();
      // Older browsers need returnValue set to show the prompt.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [shouldWarn]);

  const markSaved = useCallback(() => {
    savedRef.current = true;
    setSaved(true);
  }, []);

  const { ask } = confirm;
  const confirmLeave = useCallback(async () => {
    if (!isDirty || savedRef.current) return true;
    return ask({
      title: "Leave without saving?",
      description: "What you have typed on this form will be lost.",
      confirmLabel: "Leave",
      cancelLabel: "Keep editing",
      destructive: true,
    });
  }, [isDirty, ask]);

  return { confirmLeave, markSaved, Mount: confirm.Mount };
}
