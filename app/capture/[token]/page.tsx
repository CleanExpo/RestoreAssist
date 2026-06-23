"use client";

/**
 * Homeowner self-capture page (Homeowner Phase 4).
 *
 * Public, token-gated — NO dashboard auth. The capture token is validated by
 * GET /api/capture/[token]; on success the homeowner gets a guided (reduced)
 * sketch editor that auto-saves to the quarantine route. Invalid/expired tokens
 * show a friendly dead-end, never the editor.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { SketchEditorV2 } from "@/components/sketch/SketchEditorV2";

type LoadState = "loading" | "ready" | "invalid";

export default function HomeownerCapturePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const [state, setState] = useState<LoadState>("loading");
  const [address, setAddress] = useState("");

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
        const data = (await res.json()) as { propertyAddress?: string };
        setAddress(data.propertyAddress ?? "");
        setState("ready");
      } catch {
        if (!cancelled) setState("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-brand-deep text-white/60">
        Loading…
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
          <p className="text-sm text-white/60">
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
      <div className="relative flex-1">
        <SketchEditorV2 mode="guided" captureToken={token} />
      </div>
    </main>
  );
}
