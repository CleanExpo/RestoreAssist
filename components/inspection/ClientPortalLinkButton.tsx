"use client";

/**
 * The "single button" (Client portal Phase 1).
 *
 * One staff button on an inspection that issues the client's portal link and
 * emails it to them — the client's single entry to their claim (view status now;
 * evidence upload + authority approvals land in later phases). Thin wrapper over
 * POST /api/inspections/[id]/client-portal-link.
 */

import { useState } from "react";

export function ClientPortalLinkButton({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function send() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(
        `/api/inspections/${inspectionId}/client-portal-link`,
        { method: "POST" },
      );
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error?.message ?? "Request failed");
      }
      setUrl(body.data.url);
      setMessage(
        body.data.emailed
          ? "Sent to the client by email. You can also copy the link below."
          : "Link ready to share.",
      );
    } catch (e) {
      setMessage(
        e instanceof Error && e.message !== "Request failed"
          ? e.message
          : "Couldn’t send the client portal link. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-white/10 bg-brand-navy/60 p-3 space-y-2 text-white">
      <button
        type="button"
        onClick={send}
        disabled={busy}
        aria-label="Send claim portal to client"
        className="min-h-11 px-4 py-2 rounded-lg text-sm font-medium border border-cyan-400/40 bg-cyan-500/20 text-cyan-50 hover:bg-cyan-500/30 transition-colors disabled:opacity-40"
      >
        {busy ? "Sending…" : "Send claim portal to client"}
      </button>
      {url && (
        <div className="space-y-1">
          <label
            className="block text-xs text-white/50"
            htmlFor="client-portal-url"
          >
            Client portal link:
          </label>
          <input
            id="client-portal-url"
            readOnly
            value={url}
            aria-label="Client portal link"
            onFocus={(e) => e.currentTarget.select()}
            className="w-full px-2 py-1.5 rounded-lg bg-white/10 border border-white/10 text-xs text-white"
          />
        </div>
      )}
      {message && (
        <p role="status" className="text-xs text-white/70">
          {message}
        </p>
      )}
    </section>
  );
}
