/**
 * RA-1199 — AI Suggested Next Question
 *
 * Renders a subtle banner below the current question showing an AI-suggested
 * follow-up question derived from prior answers. User can accept (logs a
 * free-text addendum answer) or dismiss.
 *
 * Triggers after 3+ answered questions. Debounced: only re-queries when the
 * set of committed answers changes.
 */

"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, X, Loader2 } from "lucide-react";

export interface AISuggestedQuestionProps {
  sessionId: string;
  answeredQuestions: Array<{ questionText: string; answer: unknown }>;
  remainingQuestions: Array<{ questionText: string }>;
  onAccept: (suggestion: {
    question: string;
    reasoning: string;
    answer: string;
  }) => void;
}

interface Suggestion {
  question: string;
  reasoning: string;
}

const MIN_ANSWERS = 3;

export function AISuggestedQuestion({
  sessionId,
  answeredQuestions,
  remainingQuestions,
  onAccept,
}: AISuggestedQuestionProps) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [addendum, setAddendum] = useState("");
  const [showAddendum, setShowAddendum] = useState(false);
  const lastFetchKeyRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const answeredCount = answeredQuestions.length;
  // Debounce key: only refetch when the committed answer set changes.
  const fetchKey = answeredQuestions
    .map(
      (qa) =>
        `${qa.questionText}::${typeof qa.answer === "string" ? qa.answer : JSON.stringify(qa.answer ?? "")}`,
    )
    .join("|");

  useEffect(() => {
    if (!sessionId || answeredCount < MIN_ANSWERS) {
      setSuggestion(null);
      return;
    }
    if (lastFetchKeyRef.current === fetchKey) return;
    lastFetchKeyRef.current = fetchKey;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const run = async () => {
      setIsLoading(true);
      setSuggestion(null);
      setShowAddendum(false);
      setAddendum("");
      try {
        const res = await fetch(`/api/interviews/${sessionId}/suggest-next`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answeredQuestions,
            remainingQuestions,
          }),
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        if (
          data?.question &&
          typeof data.question === "string" &&
          !dismissed.has(data.question)
        ) {
          setSuggestion({
            question: data.question,
            reasoning: typeof data.reasoning === "string" ? data.reasoning : "",
          });
        }
      } catch {
        // Silent: AI suggestion is non-blocking UX sugar.
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    run();

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, fetchKey, answeredCount]);

  if (answeredCount < MIN_ANSWERS) return null;
  if (isLoading) {
    return (
      <div
        className="mt-3 flex items-center gap-2 rounded-md border border-dashed border-sky-200 bg-sky-50/60 px-3 py-2 text-xs text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        <span>AI is thinking of a follow-up…</span>
      </div>
    );
  }
  if (!suggestion) return null;

  const handleDismiss = () => {
    setDismissed((prev) => new Set(prev).add(suggestion.question));
    setSuggestion(null);
    setShowAddendum(false);
  };

  const handleAccept = () => {
    if (!addendum.trim()) {
      setShowAddendum(true);
      return;
    }
    onAccept({
      question: suggestion.question,
      reasoning: suggestion.reasoning,
      answer: addendum.trim(),
    });
    setSuggestion(null);
    setShowAddendum(false);
    setAddendum("");
  };

  return (
    <div
      className="mt-3 rounded-md border border-sky-200 bg-gradient-to-r from-sky-50 to-indigo-50 p-3 dark:border-sky-900/70 dark:from-sky-950/40 dark:to-indigo-950/40"
      role="region"
      aria-label="AI suggested follow-up question"
    >
      <div className="flex items-start gap-2">
        <Sparkles
          className="mt-0.5 h-4 w-4 flex-shrink-0 text-sky-600 dark:text-sky-300"
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
            AI suggests
          </p>
          <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-gray-100">
            {suggestion.question}
          </p>
          {suggestion.reasoning && (
            <p className="mt-1 text-xs text-gray-600 dark:text-slate-400">
              {suggestion.reasoning}
            </p>
          )}

          {showAddendum && (
            <div className="mt-2">
              <label htmlFor="ai-suggestion-answer" className="sr-only">
                Your answer to the AI suggested question
              </label>
              <textarea
                id="ai-suggestion-answer"
                value={addendum}
                onChange={(e) => setAddendum(e.target.value)}
                rows={2}
                placeholder="Type your answer…"
                className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-100"
              />
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={handleAccept}
              className="h-7 px-2.5 text-xs"
            >
              {showAddendum ? "Save answer" : "Answer this"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleDismiss}
              className="h-7 px-2 text-xs text-gray-600 hover:text-gray-900 dark:text-slate-400 dark:hover:text-gray-100"
            >
              <X className="mr-1 h-3 w-3" aria-hidden="true" />
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
