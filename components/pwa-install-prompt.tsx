"use client";

/**
 * PWA Install Prompt — RA-1462
 *
 * Listens for the `beforeinstallprompt` event (Chrome / Edge / Android) and
 * surfaces a subtle "Install app" strip below the top chrome (never over
 * bottom action bars or support widgets). Once the user accepts or dismisses,
 * the prompt is not shown again for this session.
 *
 * iOS does not fire `beforeinstallprompt` — for Safari, the user uses the
 * native Share → Add to Home Screen flow. No banner on iOS to avoid noise.
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// Minimal typing for the non-standard BeforeInstallPromptEvent.
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const SESSION_DISMISS_KEY = "ra-pwa-install-dismissed";

/** Long forms with sticky footer CTAs — keep the install strip out of the way entirely. */
function hidesInstallPromptForPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    pathname === "/dashboard/inspections/new" ||
    /^\/dashboard\/inspections\/[^/]+\/capture$/.test(pathname)
  );
}

export function PwaInstallPrompt() {
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(SESSION_DISMISS_KEY) === "1") return;
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    const handler = (event: Event) => {
      // Chrome fires this before showing its built-in mini-infobar; calling
      // preventDefault() stashes the event so we can trigger prompt() on click.
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!deferredPrompt || hidesInstallPromptForPath(pathname)) return null;

  const onInstall = async () => {
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    // Whether the user accepted or dismissed, clear the stashed event —
    // the browser will only fire beforeinstallprompt once per session.
    setDeferredPrompt(null);
    sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
  };

  const onDismiss = () => {
    setDeferredPrompt(null);
    sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
  };

  const inDashboard = pathname?.startsWith("/dashboard") ?? false;

  return (
    <div
      role="dialog"
      aria-label="Install RestoreAssist app"
      className={
        inDashboard
          ? "fixed left-1/2 top-[4.25rem] z-40 flex w-[min(100%-2rem,24rem)] -translate-x-1/2 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-sm shadow-md backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95"
          : "fixed left-1/2 top-4 z-40 flex w-[min(100%-2rem,24rem)] -translate-x-1/2 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-sm shadow-md backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95"
      }
    >
      <span className="text-slate-700 dark:text-slate-200">
        Install RestoreAssist
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onInstall}
          className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
        >
          Install
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss install prompt"
          className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          ×
        </button>
      </span>
    </div>
  );
}
