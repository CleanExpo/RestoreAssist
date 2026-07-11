"use client";

/**
 * RA-7031 (RA-1132i) — presentational transcript for the Live Teacher panel.
 * Renders user + teacher turns with clause-citation chips and a confidence
 * readout. Purely presentational: all session/stream logic lives in
 * VoiceAssistant. No icon imports (design-md-lint bans net-new lucide).
 */

import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { TranscriptTurn } from "@/lib/live-teacher/turn-stream";

export function TranscriptStream({ turns }: { turns: TranscriptTurn[] }) {
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
          </li>
        ))}
      </ol>
      <div ref={endRef} />
    </ScrollArea>
  );
}
