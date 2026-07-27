// components/capacitor/ShellPlatformProvider.tsx
//
// Carries the SERVER's verdict on "is this request the iOS Capacitor shell?"
// into the client tree, so gates can decide correctly during SSR and on the
// very first client render.
//
// Why this exists: capacitor.config.ts points the shell at the live site, so
// every shell screen is server-rendered HTML. Detecting the platform only on
// the client (navigator / @capacitor/core) is always too late — WKWebView has
// already painted the server's HTML. The root layout resolves this from the
// request user-agent and seeds it here.

"use client";

import { createContext, useContext } from "react";

/**
 * `null` means "no server verdict available" — consumers must then fall back
 * to their own synchronous client detection rather than assuming "not iOS".
 */
const ShellPlatformContext = createContext<boolean | null>(null);

export function ShellPlatformProvider({
  isIosShell,
  children,
}: {
  isIosShell: boolean;
  children: React.ReactNode;
}) {
  return (
    <ShellPlatformContext.Provider value={isIosShell}>
      {children}
    </ShellPlatformContext.Provider>
  );
}

/** Server verdict, or null when the provider is absent. */
export function useServerIosShell(): boolean | null {
  return useContext(ShellPlatformContext);
}
