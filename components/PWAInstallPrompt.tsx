"use client";

/**
 * RA-1586 — progressive-install prompt.
 *
 * Two surfaces in one component so callers can drop a single element
 * into the layout:
 *
 *   - Android / Chrome desktop: listens for `beforeinstallprompt`,
 *     defers the native prompt, and renders a dismissible bottom
 *     sheet offering to install. Clicking "Install" triggers the
 *     deferred prompt (the only way the browser will show it).
 *   - iOS Safari: detects via UA (there's no beforeinstallprompt on
 *     WebKit) and renders a coach mark describing the Share →
 *     "Add to Home Screen" gesture.
 *
 * Sticky-dismissed: once dismissed, localStorage remembers the choice
 * for 60 days so repeat visitors aren't nagged.
 */

import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pwa-install-dismissed-at";
const DISMISS_TTL_DAYS = 60;

function wasRecentlyDismissed(): boolean {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const at = Number(raw);
  if (!Number.isFinite(at)) return false;
  const ageDays = (Date.now() - at) / (1000 * 60 * 60 * 24);
  return ageDays < DISMISS_TTL_DAYS;
}

function markDismissed() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // Modern browsers — display-mode media query.
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS Safari — navigator.standalone (non-standard).
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone);
}

function isIosSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIos && isSafari;
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone() || wasRecentlyDismissed()) return;

    if (isIosSafari()) {
      setShowIosHint(true);
      setVisible(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const dismiss = useCallback(() => {
    markDismissed();
    setVisible(false);
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setVisible(false);
    markDismissed();
  }, [deferredPrompt]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Install RestoreAssist"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Install RestoreAssist
          </p>
          {showIosHint ? (
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              Tap <span aria-hidden>⎋</span> Share, then <strong>Add to Home
              Screen</strong> to keep RestoreAssist one tap away.
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              Add the app to your home screen for faster loads and offline
              photo capture on site.
            </p>
          )}
        </div>
        <button
          onClick={dismiss}
          className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          aria-label="Dismiss install prompt"
        >
          ✕
        </button>
      </div>
      {!showIosHint && deferredPrompt ? (
        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={dismiss}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Not now
          </button>
          <button
            onClick={install}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Install
          </button>
        </div>
      ) : null}
    </div>
  );
}
