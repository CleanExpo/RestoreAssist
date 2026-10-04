"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AvatarOrb } from "./AvatarOrb";
import { MARGOT_WELCOME } from "@/lib/margot-surface";
import { isCapacitorIOS } from "@/lib/capacitor";

/** Routes where the floating public assistant should stay hidden. */
const HIDDEN_PREFIXES = [
  "/dashboard",
  "/portal",
  "/api",
  "/capture",
  "/sign",
  "/invite",
  "/onboarding",
  "/setup",
] as const;

/**
 * Floating Margot assistant for public marketing surfaces.
 * Same identity as the client Chatbot (avatar, name, accent).
 * Hidden on authenticated app shells that already mount Margot.
 *
 * Mounted only after client hydration so pathname + entrance animation
 * cannot diverge from the SSR tree (avoids React hydration mismatch).
 */
export function PublicAssistantOrb() {
  const pathname = usePathname() || "/";
  const [mounted, setMounted] = useState(false);
  const [iosShell, setIosShell] = useState(false);

  useEffect(() => {
    setIosShell(isCapacitorIOS());
    setMounted(true);
  }, []);

  // Apple 3.1.1: its chat offers "Get Started" (/signup), which the iOS
  // shell must not show. Mount-gated, so it never paints before this check.
  if (!mounted || iosShell) return null;

  const hidden = HIDDEN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (hidden) return null;

  return (
    <AvatarOrb
      className="fixed right-6 bottom-6 z-[100]"
      size={64}
      greetingText={MARGOT_WELCOME}
    />
  );
}
