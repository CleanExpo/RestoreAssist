"use client";

import { useEffect, useLayoutEffect, useState } from "react";

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Arm entrance animations only after hydration so SSR markup stays visible
 * when JavaScript is slow or disabled (see app/pricing/page.tsx).
 */
export function useRevealArmed(): boolean {
  const [armed, setArmed] = useState(false);
  useIsomorphicLayoutEffect(() => setArmed(true), []);
  return armed;
}
