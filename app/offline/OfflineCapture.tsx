"use client";

/**
 * RA-7877 — start a claim with no signal.
 *
 * Opens only for an account that signed in online on this device recently
 * (lib/offline/device-identity.ts). Nothing here reaches the server: the claim
 * and its photo are kept on this device and sent once, after the account is
 * verified again (lib/offline/claim-capture-queue.ts).
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { OFFLINE_CONTEXT_EVENT, resolveOfflineActor, type OfflineOwner } from "@/lib/offline/account-boundary";
import { sameOfflineOwner } from "@/lib/offline/ownership";
import { confirmDeviceIdentityOnline } from "@/lib/offline/device-identity";
import {
  captureOfflineClaim,
  listOwnClaims,
  type OfflineClaim,
} from "@/lib/offline/claim-capture-queue";

type Gate = "checking" | "open" | "closed";

const field =
  "w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-3 text-base text-white placeholder:text-slate-500 focus:border-brand-harbour-400 focus:outline-none";

export function OfflineCapture() {
  const [gate, setGate] = useState<Gate>("checking");
  const [queued, setQueued] = useState<OfflineClaim[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formKey, setFormKey] = useState(0);
  // The account this form is for. Typed entries belong to it and to nobody else.
  const [formOwner, setFormOwner] = useState<OfflineOwner | null>(null);
  // While who the device is for is being re-checked, the form is not shown.
  const [rechecking, setRechecking] = useState(false);
  const formOwnerRef = useRef<OfflineOwner | null>(null);
  // A double tap fires twice before React re-renders; each save is a new claim.
  const saving = useRef(false);
  // Only the newest refresh may change what is shown: an older answer that
  // arrives after a sign-out or an account switch is dropped.
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    const run = ++latest.current;
    // Whoever the previous answer was for, it is not shown while this one is pending.
    setQueued([]);
    setRechecking(true);
    await confirmDeviceIdentityOnline();
    const owner = await resolveOfflineActor();
    if (run !== latest.current) return;
    const claims = owner ? await listOwnClaims().catch(() => []) : [];
    if (run !== latest.current) return;
    // A different account than the form was opened for: what was typed is gone.
    if (!owner || !sameOfflineOwner(owner, formOwnerRef.current)) {
      formOwnerRef.current = owner;
      setFormOwner(owner);
      setFormKey((k) => k + 1);
    }
    setGate(owner ? "open" : "closed");
    setQueued(claims);
    setRechecking(false);
  }, []);

  useEffect(() => {
    void refresh();
    // A sign-in, a switch of account or the network returning changes who this
    // device is for. Re-check rather than keep showing the previous answer.
    window.addEventListener("online", refresh);
    window.addEventListener(OFFLINE_CONTEXT_EVENT, refresh);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener(OFFLINE_CONTEXT_EVENT, refresh);
    };
  }, [refresh]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true;
    const data = new FormData(event.currentTarget);
    const openedFor = formOwnerRef.current;
    if (!openedFor) {
      saving.current = false;
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const photo = data.get("photo");
      await captureOfflineClaim({
        openedFor,
        propertyAddress: String(data.get("address") ?? ""),
        propertyPostcode: String(data.get("postcode") ?? ""),
        notes: String(data.get("notes") ?? ""),
        photo: photo instanceof File ? photo : null,
      });
      setSaved(true);
      setFormKey((k) => k + 1);
      await refresh();
    } catch (err) {
      // Whatever was typed may belong to another account now: re-check, and
      // clear the form if so, rather than leave it for a retry.
      void refresh();
      setError(err instanceof Error ? err.message : "The claim was not saved. Try again.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  if (gate === "checking") {
    return <p className="mt-8 text-sm text-slate-400" role="status">Checking this device…</p>;
  }

  if (gate === "closed") {
    return (
      <p className="mt-8 text-sm text-slate-400" data-testid="offline-capture-closed">
        Offline capture opens for an account that signed in on this device in the
        last 12 hours. Reconnect and sign in to enable it.
      </p>
    );
  }

  return (
    <section
      className="mt-10 w-full max-w-md text-left"
      aria-labelledby="offline-capture-heading"
      data-testid="offline-capture"
    >
      <h2 id="offline-capture-heading" className="text-lg font-semibold text-white">
        Start a claim offline
      </h2>
      <p className="mt-1 text-sm text-slate-400">
        Saved on this device. It is created once when you are back online and signed in.
      </p>

      <form
        key={`${formKey}:${formOwner?.userId ?? ""}`}
        method="post"
        onSubmit={onSubmit}
        hidden={rechecking}
        className="mt-4 space-y-3"
      >
        <label className="block text-sm text-slate-300">
          Property address
          <input name="address" required maxLength={300} autoComplete="street-address" className={field} />
        </label>
        <label className="block text-sm text-slate-300">
          Postcode
          <input name="postcode" required maxLength={10} inputMode="numeric" autoComplete="postal-code" className={field} />
        </label>
        <label className="block text-sm text-slate-300">
          Notes (optional)
          <textarea name="notes" rows={3} maxLength={2000} className={field} />
        </label>
        <label className="block text-sm text-slate-300">
          <span className="mb-1 block">Photo (optional)</span>
          <input name="photo" type="file" accept="image/*" capture="environment" className="block w-full text-sm text-slate-300" />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-brand-harbour-500 px-6 py-3 font-medium text-white transition-colors hover:bg-brand-harbour-600 disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save claim on this device"}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-300" data-testid="offline-capture-error">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="mt-3 text-sm text-emerald-300" data-testid="offline-capture-saved">
          Saved on this device. It has not been sent yet.
        </p>
      )}
      <p className="mt-4 text-sm text-slate-400" data-testid="offline-capture-count">
        {queued.length === 0
          ? "No claims waiting to send."
          : `${queued.length} claim${queued.length === 1 ? "" : "s"} waiting to send.`}
      </p>
    </section>
  );
}
