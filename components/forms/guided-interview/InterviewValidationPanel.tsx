/**
 * RA-1214 — IICRC S500:2025 Validation Panel
 *
 * Advisory-only panel rendered on the interview summary screen. User presses
 * "Run IICRC validation" to POST their answers to Claude Haiku, which returns
 * findings with S500:2025 section citations. Red alerts for errors, amber for
 * warnings. Empty findings list shows a clean confirmation.
 *
 * Does NOT block report generation — purely guidance.
 */

"use client";

import React, { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import type { InterviewQuestionAnswer } from "./GuidedInterviewPanel";

export interface ValidationFinding {
  questionId: string | null;
  severity: "warn" | "error";
  message: string;
  suggestedFix?: string;
}

export interface InterviewValidationPanelProps {
  sessionId: string;
  questionsAndAnswers: InterviewQuestionAnswer[];
}

export function InterviewValidationPanel({
  sessionId,
  questionsAndAnswers,
}: InterviewValidationPanelProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [findings, setFindings] = useState<ValidationFinding[] | null>(null);
  const [validatedAt, setValidatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const questionTextById = new Map<string, string>();
  questionsAndAnswers.forEach((qa) => {
    questionTextById.set(qa.questionId, qa.questionText);
  });

  const runValidation = async () => {
    if (!sessionId || questionsAndAnswers.length === 0) return;
    setIsLoading(true);
    setError(null);
    setFindings(null);
    try {
      const res = await fetch(`/api/interviews/${sessionId}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answeredQuestions: questionsAndAnswers.map((qa) => ({
            questionId: qa.questionId,
            questionText: qa.questionText,
            answer: qa.answer,
          })),
        }),
      });
      if (!res.ok) {
        if (res.status === 402) {
          setError(
            "An active subscription is required to run IICRC validation.",
          );
        } else if (res.status === 429) {
          setError(
            "Too many validation requests. Please wait a minute and try again.",
          );
        } else {
          setError("Could not run validation. Please try again shortly.");
        }
        return;
      }
      const data = (await res.json()) as {
        findings: ValidationFinding[];
        validatedAt: string;
      };
      setFindings(Array.isArray(data.findings) ? data.findings : []);
      setValidatedAt(data.validatedAt ?? new Date().toISOString());
    } catch {
      setError(
        "Could not run validation. Please check your connection and try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const errorCount =
    findings?.filter((f) => f.severity === "error").length ?? 0;
  const warnCount = findings?.filter((f) => f.severity === "warn").length ?? 0;

  return (
    <div
      className="rounded-lg border border-gray-200 dark:border-slate-700 bg-gradient-to-br from-[#1C2E47]/5 via-[#8A6B4E]/5 to-[#D4A574]/5 dark:from-[#1C2E47]/30 dark:via-[#8A6B4E]/20 dark:to-[#D4A574]/10 p-4"
      aria-labelledby="iicrc-validation-heading"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-2">
          <ShieldCheck
            className="h-5 w-5 flex-shrink-0 text-[#1C2E47] dark:text-[#D4A574] mt-0.5"
            aria-hidden="true"
          />
          <div>
            <h3
              id="iicrc-validation-heading"
              className="text-sm font-semibold text-gray-900 dark:text-white"
            >
              IICRC S500:2025 compliance check
            </h3>
            <p className="text-xs text-gray-600 dark:text-slate-400">
              Advisory only — does not block report generation.
            </p>
          </div>
        </div>
        <Button
          type="button"
          onClick={runValidation}
          disabled={isLoading || questionsAndAnswers.length === 0}
          className="gap-2"
          aria-label="Run IICRC S500:2025 validation on interview answers"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Validating…
            </>
          ) : (
            <>
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              {findings ? "Re-run IICRC validation" : "Run IICRC validation"}
            </>
          )}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="mt-3">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Validation unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {findings && findings.length === 0 && !error && (
        <Alert className="mt-3 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
          <CheckCircle2
            className="h-4 w-4 text-green-600 dark:text-green-400"
            aria-hidden="true"
          />
          <AlertTitle className="text-green-800 dark:text-green-300">
            No IICRC S500:2025 issues detected
          </AlertTitle>
          <AlertDescription className="text-green-800/90 dark:text-green-300/90">
            Your answers look consistent with IICRC S500:2025. Review remains
            advisory — final compliance is the technician&apos;s responsibility.
            {validatedAt && (
              <span className="block mt-1 text-xs opacity-80">
                Validated {new Date(validatedAt).toLocaleString("en-AU")}
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {findings && findings.length > 0 && (
        <div
          className="mt-3 space-y-2"
          role="list"
          aria-label="Validation findings"
        >
          <p
            className="text-xs text-gray-600 dark:text-slate-400"
            aria-live="polite"
          >
            {errorCount > 0 && (
              <span className="font-medium text-red-700 dark:text-red-400">
                {errorCount} error{errorCount === 1 ? "" : "s"}
              </span>
            )}
            {errorCount > 0 && warnCount > 0 && <span> · </span>}
            {warnCount > 0 && (
              <span className="font-medium text-amber-700 dark:text-amber-400">
                {warnCount} warning{warnCount === 1 ? "" : "s"}
              </span>
            )}
            {validatedAt && (
              <span className="ml-2 opacity-80">
                · Validated {new Date(validatedAt).toLocaleString("en-AU")}
              </span>
            )}
          </p>
          {findings.map((finding, idx) => (
            <FindingItem
              key={`${finding.questionId ?? "none"}-${idx}`}
              finding={finding}
              questionText={
                finding.questionId
                  ? questionTextById.get(finding.questionId)
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FindingItem({
  finding,
  questionText,
}: {
  finding: ValidationFinding;
  questionText: string | undefined;
}) {
  const isError = finding.severity === "error";
  return (
    <Alert
      variant={isError ? "destructive" : "default"}
      className={
        isError
          ? undefined
          : "border-amber-300 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200"
      }
      role="listitem"
    >
      {isError ? (
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
      ) : (
        <AlertTriangle
          className="h-4 w-4 text-amber-600 dark:text-amber-400"
          aria-hidden="true"
        />
      )}
      <AlertTitle
        className={isError ? undefined : "text-amber-900 dark:text-amber-200"}
      >
        {isError ? "Error" : "Warning"}
        {questionText ? ` — ${questionText}` : ""}
      </AlertTitle>
      <AlertDescription
        className={
          isError ? undefined : "text-amber-900/90 dark:text-amber-200/90"
        }
      >
        <p>{finding.message}</p>
        {finding.suggestedFix && (
          <p className="mt-1">
            <span className="font-medium">Suggested fix: </span>
            {finding.suggestedFix}
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}
