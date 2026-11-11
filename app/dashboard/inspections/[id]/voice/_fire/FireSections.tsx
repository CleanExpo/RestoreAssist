"use client";

/**
 * The job-file sections of the fire walkthrough: what is done, what is open,
 * and where each step comes from. Also serves as the section picker when the
 * technician says Margot filed an answer in the wrong place.
 */

import { FIRE_CHECKLIST, type FireChecklistSection } from "@/lib/voice/fire-smoke/checklist";
import { FIRE_COPY } from "@/lib/voice/fire-smoke/copy";
import { formatCitation } from "@/lib/voice/fire-smoke/sources";
import type { SectionStatus } from "@/lib/voice/fire-smoke/schema";
import { cn } from "@/lib/utils";

const STATE_LABEL: Record<SectionStatus["state"], string> = {
  todo: "To do",
  filled: "Done",
  na: "N/A",
};

interface SectionListProps {
  sections: SectionStatus[];
  currentSectionId: string | null;
  disabled: boolean;
  onSelect: (sectionId: string) => void;
  onMarkNa: (sectionId: string) => void;
}

export function FireSectionList({ sections, currentSectionId, disabled, onSelect, onMarkNa }: SectionListProps) {
  const byId = new Map(sections.map((s) => [s.sectionId, s]));
  return (
    <ol className="space-y-2" aria-label="Job file sections">
      {FIRE_CHECKLIST.map((section, index) => {
        const status = byId.get(section.id);
        const state = status?.state ?? "todo";
        const current = section.id === currentSectionId;
        return (
          <li
            key={section.id}
            data-section-id={section.id}
            data-state={state}
            className={cn(
              "rounded-xl border p-3",
              current ? "border-brand-gold bg-brand-gold/10" : "border-white/10 bg-white/5",
            )}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(section.id)}
                className="flex-1 text-left min-h-12"
              >
                <span className="block text-xs text-white/40">Section {index + 1}</span>
                <span className="block text-sm font-semibold text-white">{section.title}</span>
              </button>
              <span
                className={cn(
                  "text-xs px-2 py-1 rounded-md",
                  state === "filled" && "bg-green-900/40 text-green-300",
                  state === "na" && "bg-white/10 text-white/70",
                  state === "todo" && "bg-amber-900/40 text-amber-300",
                )}
              >
                {STATE_LABEL[state]}
              </span>
            </div>
            {state === "na" && status?.naReason && (
              <p className="mt-1 text-xs text-white/50">Reason: {status.naReason}</p>
            )}
            {state === "filled" && status && status.notes.length > 0 && (
              <ul className="mt-1 space-y-1" aria-label={`Saved answers for ${section.title}`}>
                {status.notes.map((note, i) => (
                  <li key={i} className="text-sm text-white/80 whitespace-pre-wrap">
                    {note}
                  </li>
                ))}
              </ul>
            )}
            {current && <SectionDetail section={section} disabled={disabled} onMarkNa={onMarkNa} />}
          </li>
        );
      })}
    </ol>
  );
}

function SectionDetail({
  section,
  disabled,
  onMarkNa,
}: {
  section: FireChecklistSection;
  disabled: boolean;
  onMarkNa: (sectionId: string) => void;
}) {
  return (
    <div className="mt-3 space-y-3">
      <ul className="space-y-2">
        {section.items.map((item) => (
          <li key={item.id} className="text-sm text-white/80">
            <p>{item.prompt}</p>
            <details className="mt-1">
              <summary className="text-xs text-white/50 cursor-pointer">{FIRE_COPY.sourcesHeading}</summary>
              <ul className="mt-1 space-y-0.5">
                {item.cites.map((cite) => (
                  <li key={`${cite.source}-${cite.pinpoint ?? ""}`} className="text-xs text-white/60">
                    {formatCitation(cite.source, cite.pinpoint)}
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
      <p className="text-xs text-white/40">{FIRE_COPY.standardsNote}</p>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onMarkNa(section.id)}
        className="w-full min-h-12 rounded-xl border border-white/20 text-sm text-white/80"
      >
        Mark this section N/A
      </button>
    </div>
  );
}

interface PickerProps {
  disabled: boolean;
  onPick: (sectionId: string) => void;
  onCancel: () => void;
}

/** Shown after the technician answers "no" to Margot's question. */
export function FireSectionPicker({ disabled, onPick, onCancel }: PickerProps) {
  return (
    <div className="space-y-2" role="group" aria-label="Choose a section">
      <p className="text-sm text-white/80">{FIRE_COPY.confirmNo}</p>
      <div className="grid grid-cols-1 gap-2">
        {FIRE_CHECKLIST.map((section) => (
          <button
            key={section.id}
            type="button"
            disabled={disabled}
            onClick={() => onPick(section.id)}
            className="min-h-14 rounded-xl border border-white/20 px-3 text-left text-sm text-white"
          >
            {section.title}
          </button>
        ))}
      </div>
      <button type="button" onClick={onCancel} className="min-h-12 w-full text-sm text-white/60">
        Cancel
      </button>
    </div>
  );
}
