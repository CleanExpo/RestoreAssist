"use client";

import { usePathname } from "next/navigation";
import { AvatarOrb } from "./AvatarOrb";
import { MARGOT_WELCOME } from "@/lib/margot-surface";

/** Routes where the floating public assistant should stay hidden. */
const HIDDEN_PREFIXES = [
  "/dashboard",
  "/portal",
  "/api",
  "/capture",
  "/sign",
  "/invite",
  "/onboarding",
] as const;

/**
 * Floating Margot assistant for public marketing surfaces.
 * Same identity as the client Chatbot (avatar, name, accent).
 * Hidden on authenticated app shells that already mount Margot.
 */
export function PublicAssistantOrb() {
  const pathname = usePathname() || "/";
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
