"use client";

/**
 * HomeownerCapturePanel (Homeowner Phase 5b).
 *
 * Staff control on the inspection page: invite a homeowner to self-capture
 * (issues a 7-day token, surfaces the /capture link to send), revoke active
 * links, and review→promote a homeowner submission out of quarantine.
 */

import { useCallback, useEffect, useState } from "react";
import { apiErrorMessage } from "@/lib/api-error-message";
import type { RoomNeedingMeasurement } from "@/lib/sketch/rooms-needing-measurement";

type Busy = null | "invite" | "revoke" | "review" | "copy";
type PanelTone = "neutral" | "success" | "error";

type CaptureStatus = {
  pendingFloors: number;
  pendingRoomCount: number;
  floorLabels: string[];
  activeCaptureLinks: number;
  roomsNeedingMeasurement: number;
  measurementRooms: RoomNeedingMeasurement[];
};

function responseMessage(res: Response, body: unknown, fallback: string): string {
  return apiErrorMessage(body) ?? fallback;
}

export function HomeownerCapturePanel({
  inspectionId,
  onPromoted,
  refreshToken = 0,
}: {
  inspectionId: string;
  onPromoted?: () => void;
  /** Bump after sketch reload so pending counts refresh. */
  refreshToken?: number;
}) {
  const [busy, setBusy] = useState<Busy>(null);
  const [link, setLink] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<PanelTone>("neutral");
  const [status, setStatus] = useState<CaptureStatus | null>(null);
  const [statusError, setStatusError] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/inspections/${inspectionId}/homeowner-capture-status`,
      );
      if (!res.ok) {
        setStatusError(true);
        return;
      }
      const body = (await res.json()) as { data?: CaptureStatus };
      setStatus(body.data ?? null);
      setStatusError(false);
    } catch {
      setStatusError(true);
    }
  }, [inspectionId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus, refreshToken]);

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
      void loadStatus();
    } catch {
      setTone("error");
      setMessage("Couldn’t create a capture link. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function copyLink() {
    if (!link) return;
    setBusy("copy");
    try {
      await navigator.clipboard.writeText(link);
      setTone("success");
      setMessage("Capture link copied to clipboard.");
    } catch {
      setTone("error");
      setMessage("Couldn’t copy — select the link field and copy manually.");
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
      void loadStatus();
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
      void loadStatus();
    } catch {
      setTone("error");
      setMessage("Couldn’t promote the submission. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const pendingFloors = status?.pendingFloors ?? 0;
  const canReview = pendingFloors > 0 && busy === null;

  const btn =
    "min-h-11 px-3 py-1.5 rounded-lg text-sm border transition-colors disabled:opacity-40";

  return (
    <section
      className="rounded-xl border border-white/10 bg-brand-navy/60 p-3 space-y-2 text-white"
      aria-busy={busy !== null}
      aria-labelledby="homeowner-capture-heading"
    >
      <h3 id="homeowner-capture-heading" className="text-sm font-semibold">
        Homeowner self-capture
      </h3>
      <p className="text-xs text-white/60">
        Invite the homeowner to draw their property. Submissions stay in review
        until you promote them — they never auto-feed the report.
      </p>

      {status && !statusError && (
        <div
          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-white/75 space-y-0.5"
          data-testid="homeowner-capture-status"
          aria-label="Homeowner capture queue summary"
        >
          {pendingFloors > 0 ? (
            <p className="text-amber-100/90 font-medium">
              {pendingFloors} floor{pendingFloors === 1 ? "" : "s"} waiting review
              {status.pendingRoomCount > 0
                ? ` · ${status.pendingRoomCount} room${status.pendingRoomCount === 1 ? "" : "s"} drawn`
                : ""}
            </p>
          ) : (
            <p>No quarantined submissions right now.</p>
          )}
          {status.activeCaptureLinks > 0 && (
            <p>
              {status.activeCaptureLinks} active capture link
              {status.activeCaptureLinks === 1 ? "" : "s"}.
            </p>
          )}
          {status.roomsNeedingMeasurement > 0 && (
            <p className="text-amber-200/80">
              {status.roomsNeedingMeasurement} promoted room
              {status.roomsNeedingMeasurement === 1 ? "" : "s"} still need
              on-site measurement on the sketch.
            </p>
          )}
        </div>
      )}

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
          disabled={!canReview}
          aria-label="Review homeowner submission"
          title={
            pendingFloors < 1
              ? "Nothing in the review queue yet"
              : undefined
          }
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
          <div className="flex gap-2">
            <input
              id="capture-link"
              readOnly
              value={link}
              aria-label="Capture link"
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 px-2 py-1.5 rounded-lg bg-white/10 border border-white/10 text-xs text-white"
            />
            <button
              type="button"
              onClick={copyLink}
              disabled={busy !== null}
              className={`${btn} shrink-0 border-white/20 text-white/90`}
            >
              {busy === "copy" ? "Copied…" : "Copy link"}
            </button>
          </div>
        </div>
      )}
      {message && (
        <p
          data-testid="homeowner-capture-feedback"
          role={tone === "error" ? "alert" : "status"}
          aria-live={tone === "error" ? "assertive" : "polite"}
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
