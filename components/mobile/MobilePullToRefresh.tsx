"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

export type RefreshResult =
  | { kind: "updated"; message?: string }
  | { kind: "offline" | "error" | "cancelled"; message: string };

type RefreshRequest = {
  respondWith: (result: Promise<RefreshResult> | RefreshResult) => void;
};

const REFRESH_EVENT = "restoreassist:pull-refresh";
const SAFE_LIST_ROUTES = new Set([
  "/dashboard/field",
  "/dashboard/inspections",
  "/dashboard/reports",
  "/dashboard/clients",
]);
const RELEASE_DISTANCE = 68;
const BLOCKED_TARGETS =
  'input,textarea,select,canvas,video,audio,[contenteditable="true"],[role="slider"],[data-no-pull-refresh]';

/** Register the current read-only page's existing data fetch with the gesture. */
export function useMobilePullRefreshHandler(handler: () => Promise<RefreshResult> | RefreshResult) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const respond = (event: Event) => {
      const request = (event as CustomEvent<RefreshRequest>).detail;
      request.respondWith(Promise.resolve().then(() => latest.current()));
    };
    window.addEventListener(REFRESH_EVENT, respond);
    return () => window.removeEventListener(REFRESH_EVENT, respond);
  }, []);
}

function hasNestedScroll(target: Element, boundary: Element): boolean {
  for (let element = target; element !== boundary; element = element.parentElement!) {
    if (!element.parentElement) break;
    const overflow = window.getComputedStyle(element).overflowY;
    if (
      (overflow === "auto" || overflow === "scroll") &&
      element.scrollHeight > element.clientHeight + 1
    ) return true;
  }
  return false;
}

function atPageTop(): boolean {
  return window.scrollY <= 0 &&
    (document.scrollingElement?.scrollTop ?? 0) <= 0 &&
    document.documentElement.scrollTop <= 0 &&
    document.body.scrollTop <= 0;
}

export function MobilePullToRefresh({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number; distance: number } | null>(null);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [phase, setPhase] = useState<"idle" | "pulling" | "ready" | "refreshing" | "result">("idle");
  const [message, setMessage] = useState("");
  const [distance, setDistance] = useState(0);

  useEffect(() => {
    const element = root.current;
    setPhase("idle");
    setDistance(0);
    if (!element || !SAFE_LIST_ROUTES.has(pathname)) return;
    const mobile = window.innerWidth < 768 ||
      (navigator.maxTouchPoints > 0 && window.innerWidth < 900);
    if (!mobile) return;

    const previousHtmlOverscroll = document.documentElement.style.overscrollBehaviorY;
    const previousBodyOverscroll = document.body.style.overscrollBehaviorY;
    // Prevent iOS Safari's viewport reload while this page owns the gesture.
    document.documentElement.style.overscrollBehaviorY = "contain";
    document.body.style.overscrollBehaviorY = "contain";
    let disposed = false;

    const reset = () => {
      gesture.current = null;
      setDistance(0);
      if (!busy.current) setPhase("idle");
    };
    const begin = (event: TouchEvent) => {
      if (event.touches.length !== 1) { reset(); return; }
      if (busy.current || !atPageTop()) return;
      const target = event.target;
      if (!(target instanceof Element) || !element.contains(target) ||
          target.closest(BLOCKED_TARGETS) || hasNestedScroll(target, element)) return;
      gesture.current = { x: event.touches[0].clientX, y: event.touches[0].clientY, distance: 0 };
    };
    const move = (event: TouchEvent) => {
      const current = gesture.current;
      if (event.touches.length !== 1) { reset(); return; }
      if (!current || busy.current) return;
      if (!atPageTop()) { reset(); return; }
      const dx = event.touches[0].clientX - current.x;
      const dy = event.touches[0].clientY - current.y;
      if (dy < 0 || (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy))) {
        reset();
        return;
      }
      if (dy <= 8) return;
      event.preventDefault();
      current.distance = Math.min(110, dy * 0.5);
      setDistance(current.distance);
      setPhase(current.distance >= RELEASE_DISTANCE ? "ready" : "pulling");
    };
    const finish = (event: TouchEvent) => {
      if (event.touches.length > 0) { reset(); return; }
      const shouldRefresh = (gesture.current?.distance ?? 0) >= RELEASE_DISTANCE;
      gesture.current = null;
      setDistance(0);
      if (!shouldRefresh || busy.current) { reset(); return; }
      busy.current = true;
      setPhase("refreshing");
      setMessage("Refreshing…");
      const responses: Promise<RefreshResult>[] = [];
      window.dispatchEvent(new CustomEvent<RefreshRequest>(REFRESH_EVENT, {
        detail: { respondWith: (result) => responses.push(Promise.resolve(result)) },
      }));
      void (async () => {
        let nextMessage = "This page is not ready to refresh.";
        if (responses.length > 0) {
          let timeout: ReturnType<typeof setTimeout> | undefined;
          try {
            const results = await Promise.race([
              Promise.all(responses),
              new Promise<RefreshResult[]>((resolve) => {
                timeout = setTimeout(
                  () => resolve([{ kind: "error", message: "Refresh timed out. Pull down to try again." }]),
                  15000,
                );
              }),
            ]);
            const problem = results.find((result) => result.kind !== "updated");
            nextMessage = problem?.message ?? results[0]?.message ?? "Page updated";
          } catch {
            nextMessage = "Could not refresh. Pull down to try again.";
          } finally {
            if (timeout) clearTimeout(timeout);
          }
        }
        if (disposed) return;
        busy.current = false;
        setMessage(nextMessage);
        setPhase("result");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          if (!disposed) setPhase("idle");
        }, 3500);
      })();
    };

    element.addEventListener("touchstart", begin, { passive: true });
    element.addEventListener("touchmove", move, { passive: false });
    element.addEventListener("touchend", finish, { passive: true });
    element.addEventListener("touchcancel", reset, { passive: true });
    return () => {
      disposed = true;
      gesture.current = null;
      busy.current = false;
      if (timer.current) clearTimeout(timer.current);
      element.removeEventListener("touchstart", begin);
      element.removeEventListener("touchmove", move);
      element.removeEventListener("touchend", finish);
      element.removeEventListener("touchcancel", reset);
      document.documentElement.style.overscrollBehaviorY = previousHtmlOverscroll;
      document.body.style.overscrollBehaviorY = previousBodyOverscroll;
    };
  }, [pathname]);

  return (
    <div ref={root} className="space-y-6">
      {phase !== "idle" && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed left-1/2 top-[calc(4.5rem+env(safe-area-inset-top))] z-50 -translate-x-1/2 rounded-full border border-cyan-400/40 bg-slate-900 px-4 py-2 text-sm text-white shadow-lg md:hidden"
          style={{ transform: `translate(-50%, ${phase === "pulling" || phase === "ready" ? distance : 0}px)` }}
        >
          {phase === "pulling" ? "Pull down to refresh" :
            phase === "ready" ? "Release to refresh" :
              phase === "refreshing" ? "Refreshing…" : message}
        </div>
      )}
      {children}
    </div>
  );
}
