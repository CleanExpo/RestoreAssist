"use client";

/**
 * RA-7031 (RA-1132i) — presentational transcript for the Live Teacher panel.
 * Renders user + teacher turns with clause-citation chips and a confidence
 * readout. Purely presentational: all session/stream logic lives in
 * VoiceAssistant. No icon imports (design-md-lint bans net-new lucide).
 */

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  humaniseToolName,
  summariseToolCall,
  toolCallGaps,
  type LiveTeacherToolCall,
  type TranscriptTurn,
} from "@/lib/live-teacher/turn-stream";

/**
 * An auditable card for one action the teacher took. Success shows the logged
 * detail; failure shows a muted "not completed" state (never an alarming
 * error) — the technician stays the decision-maker.
 */
function ToolCallCard({ call }: { call: LiveTeacherToolCall }) {
  const gaps = call.ok ? toolCallGaps(call) : [];
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-xl border px-3 py-2 text-sm",
        call.ok
          ? "border-[#8A6B4E]/40 bg-[#8A6B4E]/5 text-neutral-800 dark:text-slate-100"
          : "border-neutral-200 bg-neutral-50 text-neutral-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full",
          call.ok ? "bg-[#8A6B4E]" : "bg-neutral-400",
        )}
      />
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-400 dark:text-slate-500">
          {call.ok ? "Live Teacher action" : "Action not completed"}
        </span>
        <span>
          {call.ok ? summariseToolCall(call) : humaniseToolName(call.toolName)}
        </span>
        {call.ok && gaps.length > 0 && (
          <ul className="mt-0.5 flex flex-col gap-1">
            {gaps.map((gap) => (
              <li
                key={gap.field || gap.description}
                className="flex items-start gap-1.5 text-xs"
              >
                <span
                  className={cn(
                    "mt-0.5 rounded px-1 py-0.5 text-[10px] font-semibold uppercase leading-none",
                    gap.severity === "block"
                      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
                  )}
                >
                  {gap.severity === "block" ? "Blocker" : "Check"}
                </span>
                <span className="text-neutral-600 dark:text-slate-300">
                  {gap.description}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

type OverrideFn = (
  turnId: string,
  utteranceId: string,
  reason: string,
) => void;

/**
 * Inline override control on an assistant answer — the technician records why
 * they disagree (epic decision #8, insurer-visible). Lightweight raw controls
 * to match the transcript's presentational style.
 */
function OverrideControl({
  turn,
  onOverride,
}: {
  turn: TranscriptTurn;
  onOverride: OverrideFn;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!turn.utteranceId) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-xs text-neutral-400 underline-offset-2 hover:text-neutral-600 hover:underline dark:text-slate-500 dark:hover:text-slate-300"
      >
        Override
      </button>
    );
  }

  return (
    <div className="flex w-full max-w-[85%] flex-col gap-1.5">
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why are you overriding this? (recorded for the insurer)"
        aria-label="Override reason"
        rows={2}
        className="w-full rounded-lg border border-neutral-300 bg-white p-2 text-xs dark:border-slate-600 dark:bg-slate-900"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={reason.trim().length === 0}
          onClick={() => {
            onOverride(turn.id, turn.utteranceId as string, reason.trim());
            setOpen(false);
          }}
          className="rounded-md bg-[#1C2E47] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          Record override
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setReason("");
          }}
          className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-600 dark:border-slate-600 dark:text-slate-300"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function TranscriptStream({
  turns,
  onOverride,
}: {
  turns: TranscriptTurn[];
  onOverride?: OverrideFn;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  if (turns.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 py-10 text-center text-sm text-neutral-500 dark:text-slate-400">
        Ask the Live Teacher about this inspection — classification, drying
        standards, scope, or IICRC S500 guidance. Answers are grounded in
        Australian restoration standards and cite the clause.
      </div>
    );
  }

  return (
    <ScrollArea className="h-[420px] pr-3">
      <ol className="space-y-4" role="log" aria-live="polite" aria-label="Live Teacher transcript">
        {turns.map((turn) => (
          <li
            key={turn.id}
            className={cn(
              "flex flex-col gap-1",
              turn.role === "user" ? "items-end" : "items-start",
            )}
          >
            <span className="text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-slate-500">
              {turn.role === "user" ? "You" : "Live Teacher"}
            </span>

            {turn.role === "assistant" &&
              turn.toolCalls &&
              turn.toolCalls.length > 0 && (
                <ul
                  className="flex w-full max-w-[85%] flex-col gap-1.5"
                  aria-label="Actions the Live Teacher took"
                >
                  {turn.toolCalls.map((call) => (
                    <li key={call.id}>
                      <ToolCallCard call={call} />
                    </li>
                  ))}
                </ul>
              )}

            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap",
                turn.role === "user"
                  ? "bg-[#1C2E47] text-white"
                  : "bg-neutral-100 text-neutral-900 dark:bg-slate-800 dark:text-slate-100",
              )}
            >
              {turn.pending && !turn.content ? (
                <span className="text-neutral-500 dark:text-slate-400">
                  Thinking&hellip;
                </span>
              ) : (
                turn.content
              )}
            </div>

            {turn.role === "assistant" &&
              turn.clauseRefs &&
              turn.clauseRefs.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {turn.clauseRefs.map((ref) => (
                    <Badge
                      key={ref}
                      variant="outline"
                      className="border-[#8A6B4E]/40 text-[#8A6B4E] dark:text-[#D4A574]"
                    >
                      {ref}
                    </Badge>
                  ))}
                </div>
              )}

            {turn.role === "assistant" &&
              typeof turn.confidence === "number" &&
              !turn.pending && (
                <span className="text-xs text-neutral-400 dark:text-slate-500">
                  Confidence {Math.round(turn.confidence * 100)}%
                </span>
              )}

            {turn.role === "assistant" &&
              turn.overridden &&
              turn.overrideReason && (
                <p className="max-w-[85%] text-xs italic text-amber-700 dark:text-amber-400">
                  Overridden by technician: {turn.overrideReason}
                </p>
              )}

            {turn.role === "assistant" &&
              !turn.overridden &&
              !turn.pending &&
              turn.utteranceId &&
              onOverride && (
                <OverrideControl turn={turn} onOverride={onOverride} />
              )}
          </li>
        ))}
      </ol>
      <div ref={endRef} />
    </ScrollArea>
  );
}
