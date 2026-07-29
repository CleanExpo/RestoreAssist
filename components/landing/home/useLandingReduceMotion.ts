"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * SSR-safe reduced-motion flag for landing animations.
 *
 * `useReducedMotion()` is `null` on the server and a real boolean on the
 * client — branching `initial={reduce ? false : "hidden"}` on that value
 * causes React hydration mismatches. Until mount, always return `false`
 * so server HTML and the first client render stay identical.
 */
export function useLandingReduceMotion(): boolean {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted ? !!reduce : false;
}
