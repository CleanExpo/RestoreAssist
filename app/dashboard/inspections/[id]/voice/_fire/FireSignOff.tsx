"use client";

/**
 * Technician sign-off for the fire walkthrough. Shown only once every
 * section is filled in or marked N/A; the server refuses it otherwise.
 * This is not the inspection signature (RA-269).
 */

import { useState } from "react";
import { FIRE_COPY } from "@/lib/voice/fire-smoke/copy";
import type { WalkthroughStatus } from "@/lib/voice/fire-smoke/schema";

interface Props {
  signoff: WalkthroughStatus["signoff"];
  saving: boolean;
  onSign: (typedName: string) => void;
}

export function FireSignOff({ signoff, saving, onSign }: Props) {
  const [name, setName] = useState("");
  const [accepted, setAccepted] = useState(false);

  if (signoff.state === "signed") {
    return (
      <section aria-label="Sign-off" className="rounded-xl border border-green-500/40 bg-green-900/20 p-4">
        <p className="text-sm font-semibold text-green-200">{FIRE_COPY.signedOff}</p>
        {signoff.typedName && (
          <p className="mt-1 text-xs text-green-200/70">
            Signed by {signoff.typedName}
            {signoff.signedAt ? ` on ${new Date(signoff.signedAt).toLocaleString("en-AU")}` : ""}
          </p>
        )}
      </section>
    );
  }

  const ready = name.trim().length >= 2 && accepted && !saving;
  return (
    <section aria-label="Sign-off" className="space-y-3 rounded-xl border border-brand-gold/40 bg-brand-gold/5 p-4">
      <p className="text-sm text-white/90">
        {signoff.state === "changed" ? FIRE_COPY.changedAfterSignoff : FIRE_COPY.allDone}
      </p>
      <label className="flex items-start gap-3 text-sm text-white/90">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-1 h-6 w-6 shrink-0"
        />
        <span>{FIRE_COPY.signoffDeclaration}</span>
      </label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={FIRE_COPY.signoffNamePlaceholder}
        aria-label={FIRE_COPY.signoffNamePlaceholder}
        autoComplete="name"
        className="w-full min-h-12 rounded-xl border border-white/20 bg-white/5 px-3 text-base text-white"
      />
      <button
        type="button"
        disabled={!ready}
        onClick={() => onSign(name.trim())}
        className="w-full min-h-14 rounded-xl bg-brand-navy text-base font-semibold text-white disabled:opacity-40"
      >
        {FIRE_COPY.signoffButton}
      </button>
    </section>
  );
}
