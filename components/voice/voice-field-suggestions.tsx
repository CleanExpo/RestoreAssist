"use client";

/**
 * Accept/Reject cards for a mapped voice note. Unrecognised words are shown
 * and cannot be accepted into a job field.
 */

import type { VoiceSuggestion } from "@/lib/services/ai/voice-field-suggestions";
import { categoryRequirements } from "@/lib/anz/water-category";

export type ListedVoiceSuggestion = VoiceSuggestion & { key: string };

function formatRoomSize(lengthM?: number, widthM?: number): string {
  if (lengthM != null && widthM != null) return `${lengthM} × ${widthM} m`;
  if (lengthM != null) return `${lengthM} m`;
  if (widthM != null) return `${widthM} m`;
  return "";
}

function Card({
  label,
  children,
  onAccept,
  onReject,
  acceptLabel,
  rejectLabel,
}: {
  label: string;
  children: string;
  onAccept?: () => void;
  onReject: () => void;
  acceptLabel?: string;
  rejectLabel: string;
}) {
  return (
    <article
      aria-label={label}
      className="rounded-lg border border-white/15 bg-white/5 p-2 space-y-1.5"
    >
      <p className="text-xs text-white/90">{children}</p>
      {onAccept && (
        <p className="text-[10px] text-white/45 leading-snug">
          Not saved until you accept.
        </p>
      )}
      <div className="flex gap-1.5">
        {onAccept && acceptLabel && (
          <button
            type="button"
            aria-label={acceptLabel}
            onClick={onAccept}
            className="flex-1 min-h-11 rounded-lg bg-white/15 text-white text-xs font-medium hover:bg-white/25"
          >
            Accept
          </button>
        )}
        <button
          type="button"
          aria-label={rejectLabel}
          onClick={onReject}
          className="flex-1 min-h-11 rounded-lg border border-white/15 text-white/80 text-xs font-medium hover:bg-white/10"
        >
          {onAccept ? "Reject" : "Dismiss"}
        </button>
      </div>
    </article>
  );
}

export function VoiceFieldSuggestionList({
  suggestions,
  onAccept,
  onReject,
}: {
  suggestions: ListedVoiceSuggestion[];
  onAccept: (suggestion: ListedVoiceSuggestion) => void;
  onReject: (suggestion: ListedVoiceSuggestion) => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div className="space-y-1.5" data-testid="voice-field-suggestions">
      {suggestions.map((suggestion) => {
        if (suggestion.kind === "material") {
          return (
            <Card
              key={suggestion.key}
              label="Suggested material"
              acceptLabel="Accept material"
              rejectLabel="Reject material"
              onAccept={() => onAccept(suggestion)}
              onReject={() => onReject(suggestion)}
            >
              {`Material: ${suggestion.material.name}`}
            </Card>
          );
        }
        if (suggestion.kind === "waterCategory") {
          const label = categoryRequirements(suggestion.waterCategory).label;
          return (
            <Card
              key={suggestion.key}
              label="Suggested water category"
              acceptLabel="Accept water category"
              rejectLabel="Reject water category"
              onAccept={() => onAccept(suggestion)}
              onReject={() => onReject(suggestion)}
            >
              {`Water category: ${label} (${suggestion.waterCategory})`}
            </Card>
          );
        }
        if (suggestion.kind === "dimensions") {
          return (
            <Card
              key={suggestion.key}
              label="Suggested room size"
              acceptLabel="Accept room size"
              rejectLabel="Reject room size"
              onAccept={() => onAccept(suggestion)}
              onReject={() => onReject(suggestion)}
            >
              {`Room size: ${formatRoomSize(suggestion.lengthM, suggestion.widthM)}`}
            </Card>
          );
        }
        return (
          <Card
            key={suggestion.key}
            label={`Unrecognised ${suggestion.term}`}
            rejectLabel={`Dismiss ${suggestion.term}`}
            onReject={() => onReject(suggestion)}
          >
            {`didn't recognise: ${suggestion.term}`}
          </Card>
        );
      })}
    </div>
  );
}
