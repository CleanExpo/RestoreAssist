"use client";

/**
 * Homeowner self-capture page (Homeowner Phase 4).
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { SketchEditorV2 } from "@/components/sketch/SketchEditorV2";
import type { CaptureHydrationFloor } from "@/lib/sketch/capture-floor-hydration";

type LoadState = "loading" | "ready" | "invalid" | "network";

export default function HomeownerCapturePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const [state, setState] = useState<LoadState>("loading");
  const [address, setAddress] = useState("");
  const [floors, setFloors] = useState<CaptureHydrationFloor[] | undefined>();

  useEffect(() => {
    if (!token) {
      setState("invalid");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/capture/${token}`);
        if (cancelled) return;
        if (!res.ok) {
          setState("invalid");
          return;
        }
        const data = (await res.json()) as {
          propertyAddress?: string;
          floors?: CaptureHydrationFloor[];
        };
        setAddress(data.propertyAddress ?? "");
        setFloors(data.floors);
        setState("ready");
      } catch {
        if (!cancelled) setState("network");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state === "loading") {
    return (
      <main
        className="min-h-screen flex items-center justify-center bg-brand-deep text-white/60"
        role="status"
        aria-live="polite"
      >
        Loading your capture session…
      </main>
    );
  }

  if (state === "network") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-brand-deep px-6 text-center">
        <div className="max-w-sm space-y-3">
          <h1 className="text-lg font-semibold text-white">Connection problem</h1>
          <p className="text-sm text-white/60" role="alert">
            We couldn’t reach the server. Check your connection and refresh the
            page.
          </p>
          <button
            type="button"
            className="min-h-11 px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-medium"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (state === "invalid") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-brand-deep px-6 text-center">
        <div className="max-w-sm space-y-2">
          <h1 className="text-lg font-semibold text-white">
            This capture link isn’t valid
          </h1>
          <p className="text-sm text-white/60" role="alert">
            The link may have expired or been revoked. Please ask your assessor
            for a new capture link.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col bg-brand-deep text-white">
      <header className="px-4 py-3 border-b border-white/10">
        <h1 className="text-base font-semibold">Capture your property</h1>
        {address && <p className="text-sm text-white/60">{address}</p>}
        <p className="text-xs text-white/50 mt-1">
          Draw each room and mark any damp or damaged areas. It saves
          automatically — your assessor reviews everything you submit.
        </p>
      </header>
      <div className="relative flex-1 min-h-0 flex flex-col">
        <SketchEditorV2
          mode="guided"
          captureToken={token}
          captureInitialFloors={floors}
          className="!h-full min-h-0 rounded-none"
        />
      </div>
    </main>
  );
}
