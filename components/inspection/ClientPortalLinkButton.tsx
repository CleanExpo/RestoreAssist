"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChromeCheck, ChromeCircle, ChromeSpinner } from "@/components/brand/chrome-icons";
import {
  buildClientPortalLinkChecklist,
  type InspectionCommsReadiness,
} from "@/lib/dashboard/inspection-comms-readiness";
import {
  clientPortalPanelPadding,
  clientPortalPrimaryButton,
  clientPortalMuted,
} from "@/lib/portal/client-portal-theme";
import { cn } from "@/lib/utils";

export function ClientPortalLinkButton({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [readiness, setReadiness] = useState<InspectionCommsReadiness | null>(
    null,
  );
  const [readinessLoading, setReadinessLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/inspections/${inspectionId}/comms-readiness`,
        );
        if (!res.ok) return;
        const body = (await res.json()) as { data: InspectionCommsReadiness };
        if (!cancelled) setReadiness(body.data);
      } finally {
        if (!cancelled) setReadinessLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inspectionId]);

  const checklist = buildClientPortalLinkChecklist(
    readiness ?? {
      emailServiceConfigured: false,
      clientHasEmail: false,
      clientEmail: null,
    },
  );
  const canSend = checklist.every((item) => item.ok);

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
          One secure link for this job — view progress, upload photos, and
          complete approvals. Same checklist as report delivery.
        </p>
        {readiness?.portalLinkEmailedAt && (
          <p className="mt-2 text-xs text-cyan-300/90">
            Portal link emailed{" "}
            {new Date(readiness.portalLinkEmailedAt).toLocaleString("en-AU", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            . Sending again refreshes the link expiry.
          </p>
        )}
      </div>

      <ul className="space-y-2 rounded-lg border border-white/10 bg-slate-950/40 p-3">
        {readinessLoading ? (
          <li className="flex items-center gap-2 text-xs text-slate-400">
            <ChromeSpinner className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Checking send readiness…
          </li>
        ) : (
          checklist.map((item) => (
            <li key={item.id} className="flex gap-2 text-xs">
              {item.ok ? (
                <ChromeCheck
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400"
                  aria-hidden
                />
              ) : (
                <ChromeCircle
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500"
                  aria-hidden
                />
              )}
              <div>
                <p
                  className={cn(
                    "font-medium",
                    item.ok ? "text-slate-200" : "text-slate-400",
                  )}
                >
                  {item.label}
                </p>
                <p className="text-slate-500">{item.hint}</p>
                {item.href && !item.ok && (
                  <Link
                    href={item.href}
                    className="text-cyan-400/90 underline-offset-2 hover:underline"
                  >
                    Open settings
                  </Link>
                )}
              </div>
            </li>
          ))
        )}
      </ul>

      <button
        type="button"
        onClick={send}
        disabled={busy || readinessLoading || !canSend}
        aria-label="Send portal link"
        className={`${clientPortalPrimaryButton} w-full sm:w-auto`}
      >
        {busy ? "Sending…" : "Send portal link"}
      </button>
      {!readinessLoading && !canSend && (
        <p className="text-xs text-amber-300/90">
          Fix the items above before sending — the client won&apos;t receive a
          link until email is on file and outbound mail is configured.
        </p>
      )}
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
