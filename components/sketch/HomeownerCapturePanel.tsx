"use client";

/**
 * HomeownerCapturePanel (Homeowner Phase 5b).
 *
 * Staff control on the inspection page: invite a homeowner to self-capture
 * (issues a 7-day token, surfaces the /capture link to send), revoke active
 * links, and review→promote a homeowner submission out of quarantine.
 *
 * Thin wrapper over the authed routes (Phase 5):
 *   POST/DELETE /api/inspections/[id]/capture-invite
 *   POST       /api/inspections/[id]/sketches/promote-homeowner
 */

import { useState } from "react";

type Busy = null | "invite" | "revoke" | "review";

export function HomeownerCapturePanel({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const [busy, setBusy] = useState<Busy>(null);
  const [link, setLink] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function invite() {
    setBusy("invite");
    setMessage("");
    try {
      const res = await fetch(
        `/api/inspections/${inspectionId}/capture-invite`,
        { method: "POST" },
      );
      const body = await res.json();
      if (!res.ok) throw new Error();
      setLink(body.data.url);
    } catch {
      setMessage("Couldn’t create a capture link. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function revoke() {
    setBusy("revoke");
    setMessage("");
    try {
      const res = await fetch(
        `/api/inspections/${inspectionId}/capture-invite`,
        { method: "DELETE" },
      );
      const body = await res.json();
      if (!res.ok) throw new Error();
      setLink(null);
      setMessage(`Revoked ${body.data.revoked} capture link(s).`);
    } catch {
      setMessage("Couldn’t revoke. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function review() {
    setBusy("review");
    setMessage("");
    try {
      const res = await fetch(
        `/api/inspections/${inspectionId}/sketches/promote-homeowner`,
        { method: "POST" },
      );
      const body = await res.json();
      if (!res.ok) throw new Error();
      setMessage(
        body.data.promoted > 0
          ? `Promoted ${body.data.promoted} homeowner submission(s) into the sketch.`
          : "No homeowner submissions to review yet.",
      );
    } catch {
      setMessage("Couldn’t promote the submission. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const btn =
    "min-h-11 px-3 py-1.5 rounded-lg text-sm border transition-colors disabled:opacity-40";

  return (
    <section className="rounded-xl border border-white/10 bg-[#1C2E47]/60 p-3 space-y-2 text-white">
      <h3 className="text-sm font-semibold">Homeowner self-capture</h3>
      <p className="text-xs text-white/60">
        Invite the homeowner to draw their property. Submissions stay in review
        until you promote them — they never auto-feed the report.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={invite}
          disabled={busy !== null}
          aria-label="Invite homeowner to capture"
          className={`${btn} border-cyan-400/40 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25`}
        >
          {busy === "invite" ? "Creating…" : "Invite homeowner…"}
        </button>
        <button
          type="button"
          onClick={review}
          disabled={busy !== null}
          aria-label="Review homeowner submission"
          className={`${btn} border-emerald-400/40 bg-emerald-500/15 text-success hover:bg-emerald-500/25`}
        >
          {busy === "review" ? "Reviewing…" : "Review submission"}
        </button>
        <button
          type="button"
          onClick={revoke}
          disabled={busy !== null}
          aria-label="Revoke capture links"
          className={`${btn} border-rose-400/30 text-destructive hover:bg-rose-500/15`}
        >
          {busy === "revoke" ? "Revoking…" : "Revoke links"}
        </button>
      </div>
      {link && (
        <div className="space-y-1">
          <label className="block text-xs text-white/50" htmlFor="capture-link">
            Send this link to the homeowner (expires in 7 days):
          </label>
          <input
            id="capture-link"
            readOnly
            value={link}
            aria-label="Capture link"
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
