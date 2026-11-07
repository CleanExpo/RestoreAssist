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
import { apiErrorMessage } from "@/lib/api-error-message";

type Busy = null | "invite" | "revoke" | "review";
type PanelTone = "neutral" | "success" | "error";

function responseMessage(res: Response, body: unknown, fallback: string): string {
  return apiErrorMessage(body) ?? fallback;
}

export function HomeownerCapturePanel({
  inspectionId,
  onPromoted,
}: {
  inspectionId: string;
  /** Called after a successful promote so the inspection can reload sketches. */
  onPromoted?: () => void;
}) {
  const [busy, setBusy] = useState<Busy>(null);
  const [link, setLink] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<PanelTone>("neutral");

  async function invite() {
    setBusy("invite");
    setMessage("");
    setTone("neutral");
    try {
      const res = await fetch(
        `/api/inspections/${inspectionId}/capture-invite`,
        { method: "POST" },
      );
      const body = await res.json();
      if (!res.ok) {
        setTone("error");
        setMessage(
          responseMessage(res, body, "Couldn’t create a capture link. Try again."),
        );
        return;
      }
      setLink(body.data.url);
      setTone("success");
      setMessage("Capture link ready — send it to the homeowner.");
    } catch {
      setTone("error");
      setMessage("Couldn’t create a capture link. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function revoke() {
    setBusy("revoke");
    setMessage("");
    setTone("neutral");
    try {
      const res = await fetch(
        `/api/inspections/${inspectionId}/capture-invite`,
        { method: "DELETE" },
      );
      const body = await res.json();
      if (!res.ok) {
        setTone("error");
        setMessage(responseMessage(res, body, "Couldn’t revoke. Try again."));
        return;
      }
      setLink(null);
      setTone("success");
      setMessage(`Revoked ${body.data.revoked} capture link(s).`);
    } catch {
      setTone("error");
      setMessage("Couldn’t revoke. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function review() {
    setBusy("review");
    setMessage("");
    setTone("neutral");
    try {
      const res = await fetch(
        `/api/inspections/${inspectionId}/sketches/promote-homeowner`,
        { method: "POST" },
      );
      const body = await res.json();
      if (!res.ok) {
        setTone("error");
        setMessage(
          responseMessage(res, body, "Couldn’t promote the submission. Try again."),
        );
        return;
      }
      const promoted = body.data?.promoted ?? 0;
      const homeownerRooms = body.data?.homeownerRooms ?? 0;
      if (promoted > 0) {
        setTone("success");
        const roomNote =
          homeownerRooms > 0
            ? ` ${homeownerRooms} room${homeownerRooms === 1 ? "" : "s"} need on-site measurement before billing — open the sketch and confirm each.`
            : "";
        setMessage(
          `Promoted ${promoted} homeowner submission(s) into the sketch.${roomNote}`,
        );
        onPromoted?.();
      } else {
        setTone("neutral");
        setMessage("No homeowner submissions to review yet.");
      }
    } catch {
      setTone("error");
      setMessage("Couldn’t promote the submission. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const btn =
    "min-h-11 px-3 py-1.5 rounded-lg text-sm border transition-colors disabled:opacity-40";

  return (
    <section className="rounded-xl border border-white/10 bg-brand-navy/60 p-3 space-y-2 text-white">
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
          className={`${btn} border-emerald-400/40 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25`}
        >
          {busy === "review" ? "Reviewing…" : "Review submission"}
        </button>
        <button
          type="button"
          onClick={revoke}
          disabled={busy !== null}
          aria-label="Revoke capture links"
          className={`${btn} border-rose-400/30 text-rose-200 hover:bg-rose-500/15`}
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
        <p
          role={tone === "error" ? "alert" : "status"}
          className={cnMessage(tone)}
        >
          {message}
        </p>
      )}
    </section>
  );
}

function cnMessage(tone: PanelTone): string {
  const base = "text-xs ";
  if (tone === "error") return `${base} text-rose-200`;
  if (tone === "success") return `${base} text-emerald-100/90`;
  return `${base} text-white/70`;
}
