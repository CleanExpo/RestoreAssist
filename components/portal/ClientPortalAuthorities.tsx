"use client";

/**
 * Client-portal Authorities panel (client portal Phase 3b).
 *
 * Lists every Authority the client must approve (GET /api/portal/[token]/authorities)
 * and lets them approve each in one place by typing their name. Signing posts to
 * the EXISTING authority-sign route (POST /api/authority-forms/sign/[signToken]),
 * which performs the legal capture (IP/UA, timestamp, atomic completion, PDF) —
 * this component only collects the typed signature.
 */

import { useEffect, useState } from "react";
import { typedSignatureDataUrl } from "@/lib/portal/typed-signature";

interface Authority {
  id: string;
  name: string;
  description: string;
  status: string;
  signToken: string;
}

export function ClientPortalAuthorities({ token }: { token: string }) {
  const [authorities, setAuthorities] = useState<Authority[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [signed, setSigned] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/portal/${token}/authorities`);
        if (!res.ok || cancelled) return;
        const body = await res.json();
        if (!cancelled) setAuthorities(body.data?.authorities ?? []);
      } catch {
        if (!cancelled) setAuthorities([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function sign(a: Authority) {
    const signatoryName = (names[a.id] ?? "").trim();
    if (!signatoryName) return;
    setBusyId(a.id);
    setError("");
    try {
      const res = await fetch(`/api/authority-forms/sign/${a.signToken}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          signatoryName,
          signatureData: typedSignatureDataUrl(signatoryName),
        }),
      });
      if (!res.ok) throw new Error("failed");
      setSigned((s) => ({ ...s, [a.id]: true }));
    } catch {
      setError("Couldn’t submit that approval. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (authorities === null) return null; // not loaded yet
  if (authorities.length === 0) return null; // nothing to approve

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">
          Approvals needed from you
        </h2>
        <p className="text-xs text-slate-500">
          Please review and approve the authorities below by typing your full
          name to sign.
        </p>
      </div>
      <ul className="space-y-3">
        {authorities.map((a) => (
          <li key={a.id} className="rounded-lg border border-slate-200 p-3">
            <p className="text-sm font-medium text-slate-900">{a.name}</p>
            <p className="text-xs text-slate-500 mt-0.5">{a.description}</p>
            {signed[a.id] ? (
              <p
                role="status"
                className="text-xs text-success font-medium mt-2"
              >
                ✓ Approved — thank you.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={names[a.id] ?? ""}
                  onChange={(e) =>
                    setNames((n) => ({ ...n, [a.id]: e.target.value }))
                  }
                  placeholder="Type your full name to sign"
                  aria-label={`Your full name to approve ${a.name}`}
                  className="flex-1 min-w-[180px] px-2 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-400"
                />
                <button
                  type="button"
                  onClick={() => sign(a)}
                  disabled={busyId === a.id || !(names[a.id] ?? "").trim()}
                  aria-label={`Approve and sign ${a.name}`}
                  className="min-h-11 px-4 rounded-lg bg-cyan-600 text-white text-sm font-medium hover:bg-cyan-700 disabled:opacity-40"
                >
                  {busyId === a.id ? "Signing…" : "Approve & sign"}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
