"use client";

/**
 * Fire and smoke make-safe walkthrough screen (Voice Copilot).
 *
 * Margot reads each section's prompt, the technician answers by voice or by
 * typing, and the server files each answer or asks which section it belongs
 * to. A large tap toggle turns listening on and off, sized for gloves.
 */

import { useRouter } from "next/navigation";
import { FIRE_CHECKLIST, getFireSection } from "@/lib/voice/fire-smoke/checklist";
import { FIRE_COPY } from "@/lib/voice/fire-smoke/copy";
import type { FireWalkthroughResponse } from "@/lib/voice/fire-smoke/schema";
import { cn } from "@/lib/utils";
import { FireSectionList, FireSectionPicker } from "./FireSections";
import { FireSignOff } from "./FireSignOff";
import { useFireWalkthrough } from "./use-fire-walkthrough";

/** At least 120 px so a gloved thumb cannot miss it (spec AC-7). */
export const FIRE_TOGGLE_SIZE_PX = 144;

interface Props {
  inspectionId: string;
  initial: FireWalkthroughResponse;
}

export function FireWalkthrough({ inspectionId, initial }: Props) {
  const router = useRouter();
  const w = useFireWalkthrough(inspectionId, initial);
  const { status } = w.view;
  const done = status.sections.filter((s) => s.state !== "todo").length;
  const acknowledged = status.noticeAcknowledged;
  const allClosed = status.openSectionIds.length === 0;
  const inputDisabled = !acknowledged || !w.sessionReady || w.locked || w.picking !== null;

  return (
    <div className="flex min-h-screen flex-col bg-brand-canvas text-white">
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <button
          type="button"
          onClick={() => router.push(`/dashboard/inspections/${inspectionId}`)}
          className="min-h-12 rounded-lg px-3 text-sm text-white/70"
        >
          Back
        </button>
        <div className="flex-1">
          <p className="text-sm font-semibold">Fire and smoke make-safe</p>
          <p className="text-xs text-white/50">
            {done} of {FIRE_CHECKLIST.length} sections done
          </p>
        </div>
      </header>

      <main className="flex-1 space-y-4 px-4 py-4">
        {w.say && (
          <p aria-live="polite" data-testid="margot-says" className="rounded-xl bg-brand-navy/60 p-3 text-sm text-white/90">
            <span className="mr-1 font-semibold text-brand-gold">Margot:</span>
            {w.say}
          </p>
        )}
        {w.problem && (
          <p role="alert" className="rounded-xl border border-red-500/40 bg-red-900/30 p-3 text-sm text-red-200">
            {w.problem}
          </p>
        )}
        {w.pending && (
          <button
            type="button"
            disabled={w.saving}
            onClick={() => void w.retry()}
            className="min-h-16 w-full rounded-xl border-2 border-brand-gold bg-brand-navy text-base font-semibold disabled:opacity-40"
          >
            {w.saving ? "Saving" : FIRE_COPY.retryButton}
          </button>
        )}
        {w.sessionFailed && (
          <div role="alert" className="space-y-2 rounded-xl border border-red-500/40 bg-red-900/30 p-3 text-sm text-red-200">
            <p>Could not start the voice session. Check your signal.</p>
            <button type="button" onClick={() => void w.retrySession()} className="min-h-12 w-full rounded-lg border border-red-300/40">
              Try again
            </button>
          </div>
        )}

        {!acknowledged ? (
          <section aria-label={FIRE_COPY.noticeTitle} className="space-y-3 rounded-xl border border-white/15 bg-white/5 p-4">
            <h1 className="text-lg font-semibold">{FIRE_COPY.noticeTitle}</h1>
            <p className="text-sm text-white/80">{FIRE_COPY.notice}</p>
            <button type="button" onClick={w.readNotice} className="min-h-12 w-full rounded-xl border border-white/20 text-sm">
              Read it to me
            </button>
            <button
              type="button"
              disabled={!w.sessionReady || w.locked}
              onClick={() => void w.acknowledge()}
              className="min-h-16 w-full rounded-xl bg-brand-navy text-base font-semibold disabled:opacity-40"
            >
              {FIRE_COPY.noticeAccept}
            </button>
          </section>
        ) : (
          <ListeningToggle
            supported={w.speech.supported}
            wanted={w.speech.wanted}
            listening={w.speech.listening}
            onToggle={() => w.speech.setListeningWanted(!w.speech.wanted)}
          />
        )}

        {w.ask && (
          <div role="group" aria-label="Margot's question" className="space-y-2">
            <p className="text-sm text-white/90">{w.ask.say}</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={w.locked} onClick={() => w.answerAsk(true)} className="min-h-16 rounded-xl bg-green-800 text-base font-semibold">
                Yes
              </button>
              <button type="button" disabled={w.locked} onClick={() => w.answerAsk(false)} className="min-h-16 rounded-xl bg-white/10 text-base font-semibold">
                No
              </button>
            </div>
          </div>
        )}
        {w.picking !== null && <FireSectionPicker disabled={w.locked} onPick={w.pick} onCancel={w.cancelPick} />}

        <form
          method="post"
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            w.submitTyped();
          }}
        >
          <textarea
            value={w.typed}
            onChange={(e) => w.setTyped(e.target.value)}
            disabled={inputDisabled}
            rows={3}
            aria-label={FIRE_COPY.typedPlaceholder}
            placeholder={w.naFor ? FIRE_COPY.naAskReason : FIRE_COPY.typedPlaceholder}
            className="w-full rounded-xl border border-white/20 bg-white/5 p-3 text-base text-white disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={inputDisabled || !w.typed.trim()}
            className="min-h-14 w-full rounded-xl bg-brand-navy text-base font-semibold disabled:opacity-40"
          >
            {w.saving ? "Saving" : FIRE_COPY.typedSubmit}
          </button>
        </form>

        {acknowledged && (
          <>
            {!allClosed && (
              <button
                type="button"
                disabled={w.locked}
                onClick={w.nextSection}
                className="min-h-14 w-full rounded-xl border border-brand-gold/50 text-base"
              >
                Next section
                {w.currentSectionId ? ` (now: ${getFireSection(w.currentSectionId)?.title ?? ""})` : ""}
              </button>
            )}
            {allClosed && <FireSignOff signoff={status.signoff} saving={w.locked} onSign={(n) => w.signOff(n)} />}
            <FireSectionList
              sections={status.sections}
              currentSectionId={w.currentSectionId}
              disabled={w.locked}
              onSelect={w.selectSection}
              onMarkNa={w.markNa}
            />
          </>
        )}
      </main>
    </div>
  );
}

function ListeningToggle({
  supported,
  wanted,
  listening,
  onToggle,
}: {
  supported: boolean;
  wanted: boolean;
  listening: boolean;
  onToggle: () => void;
}) {
  if (!supported) {
    return (
      <p className="rounded-xl border border-white/15 p-3 text-sm text-white/70">
        This browser cannot listen. Type your answers in the box below.
      </p>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={wanted}
        aria-label={wanted ? FIRE_COPY.toggleOn : FIRE_COPY.toggleOff}
        data-testid="fire-listen-toggle"
        style={{ width: FIRE_TOGGLE_SIZE_PX, height: FIRE_TOGGLE_SIZE_PX }}
        className={cn(
          "rounded-full border-4 text-lg font-bold transition-colors",
          listening ? "border-red-300 bg-red-600" : "border-white/30 bg-brand-navy",
        )}
      >
        {wanted ? "ON" : "OFF"}
      </button>
      <p className="text-sm text-white/70" data-testid="fire-listen-state">
        {listening ? FIRE_COPY.listening : FIRE_COPY.paused}
      </p>
    </div>
  );
}
