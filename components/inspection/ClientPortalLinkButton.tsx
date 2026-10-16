"use client";

import { useState } from "react";
import {
  clientPortalPanelPadding,
  clientPortalPrimaryButton,
  clientPortalMuted,
} from "@/lib/portal/client-portal-theme";

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
          ? "Email sent. You can copy the link below if needed."
          : "Link ready. Email was not sent — check the client email and mail settings.",
      );
    } catch (e) {
      setMessage(
        e instanceof Error && e.message !== "Request failed"
          ? e.message
          : "Could not send the portal link. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${clientPortalPanelPadding} space-y-3`}>
      <div>
        <p className="text-sm font-semibold text-white/95">Client portal</p>
        <p className={`mt-0.5 ${clientPortalMuted}`}>
          Email a secure link so the client can view this job, upload photos, and
          complete approvals.
        </p>
      </div>
      <button
        type="button"
        onClick={send}
        disabled={busy}
        aria-label="Send portal link"
        className={`${clientPortalPrimaryButton} w-full sm:w-auto`}
      >
        {busy ? "Sending…" : "Send portal link"}
      </button>
      {url && (
        <div className="space-y-1">
          <label
            className="block text-xs text-slate-500"
            htmlFor="client-portal-url"
          >
            Link to copy
          </label>
          <input
            id="client-portal-url"
            readOnly
            value={url}
            aria-label="Client portal link"
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-lg border border-white/10 bg-slate-950/50 px-2 py-1.5 text-xs text-slate-200"
          />
        </div>
      )}
      {message && (
        <p role="status" className={`text-xs ${clientPortalMuted}`}>
          {message}
        </p>
      )}
    </section>
  );
}
