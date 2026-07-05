"use client";

/**
 * RA-5039 PR2 — Field Evidence Checklist Panel.
 *
 * Read-only, informational surface for the FieldEvidenceChecklist (RA-5039
 * PR1). Renders three severity sections — Required missing, Recommended
 * missing, Weak (QA score < 70) — plus declared areas with zero evidence
 * and unlinked room tags. Per the ticket's read-only acceptance criteria,
 * this panel never disables or gates any submit/generate action; it is
 * additive next to the existing hard gates (SubmissionGatePanel, the
 * COMPLETED-status report-generation button).
 */

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { apiErrorMessage } from "@/lib/api-error-message";
import type {
  ChecklistItem,
  FieldEvidenceChecklist,
} from "@/lib/evidence/field-evidence-checklist";

interface FieldEvidenceChecklistPanelProps {
  inspectionId: string;
  className?: string;
}

export function FieldEvidenceChecklistPanel({
  inspectionId,
  className,
}: FieldEvidenceChecklistPanelProps) {
  const [checklist, setChecklist] = useState<FieldEvidenceChecklist | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadChecklist = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/inspections/${inspectionId}/field-evidence-checklist`,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          apiErrorMessage(data) ?? "Failed to load field evidence checklist",
        );
        return;
      }
      setChecklist(data.data);
    } catch {
      setError("Failed to load field evidence checklist — check your connection");
    } finally {
      setLoading(false);
    }
  }, [inspectionId]);

  useEffect(() => {
    loadChecklist();
  }, [loadChecklist]);

  if (loading) {
    return (
      <div
        className={cn(
          "rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50 p-5",
          className,
        )}
      >
        <div className="flex items-center gap-3">
          <Spinner className="text-brand-navy dark:text-brand-gold" />
          <span className="text-sm text-neutral-600 dark:text-slate-400">
            Loading field evidence checklist...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          "rounded-xl border border-destructive-subtle-foreground/30 bg-destructive-subtle p-5",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-destructive-subtle-foreground">
            {error}
          </span>
          <Button variant="outline" size="sm" onClick={loadChecklist}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!checklist) return null;

  const requiredMissing = checklist.categories.required.filter(
    (item) => item.status === "missing",
  );
  const recommendedMissing = checklist.categories.recommended.filter(
    (item) => item.status === "missing",
  );
  const weakItems = [
    ...checklist.categories.required,
    ...checklist.categories.recommended,
  ].filter((item) => item.status === "weak");
  const areaGaps = checklist.gapsByAffectedArea;
  const unlinked = checklist.unlinkedEvidence;

  const isComplete =
    requiredMissing.length === 0 &&
    recommendedMissing.length === 0 &&
    weakItems.length === 0 &&
    areaGaps.length === 0 &&
    unlinked.length === 0;

  return (
    <div
      className={cn(
        "rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50 p-5 space-y-4",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
          Field Evidence Checklist
        </h3>
        <span className="text-xs text-neutral-500 dark:text-slate-400">
          Informational only — does not block submission or report generation
        </span>
      </div>

      {isComplete ? (
        <p className="text-sm text-success-subtle-foreground bg-success-subtle rounded-lg px-3 py-2">
          All required and recommended field evidence has been captured.
        </p>
      ) : (
        <div className="space-y-4">
          {requiredMissing.length > 0 && (
            <ChecklistSection
              title={`Required — missing (${requiredMissing.length})`}
              tone="destructive"
              items={requiredMissing}
            />
          )}

          {recommendedMissing.length > 0 && (
            <ChecklistSection
              title={`Recommended — missing (${recommendedMissing.length})`}
              tone="warning"
              items={recommendedMissing}
            />
          )}

          {weakItems.length > 0 && (
            <ChecklistSection
              title={`Weak (QA score < 70) (${weakItems.length})`}
              tone="warning"
              items={weakItems}
            />
          )}

          {areaGaps.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-destructive-subtle-foreground uppercase tracking-wide mb-2">
                Affected areas with no evidence ({areaGaps.length})
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {areaGaps.map((gap) => (
                  <Badge key={gap.roomZoneId} variant="outline">
                    {gap.roomZoneId}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {unlinked.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-neutral-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                Evidence tagged to unrecognised rooms ({unlinked.length})
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {unlinked.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChecklistSection({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "destructive" | "warning";
  items: ChecklistItem[];
}) {
  const toneClasses =
    tone === "destructive"
      ? "text-destructive-subtle-foreground"
      : "text-warning-subtle-foreground";

  return (
    <div>
      <h4
        className={cn(
          "text-xs font-semibold uppercase tracking-wide mb-2",
          toneClasses,
        )}
      >
        {title}
      </h4>
      <div className="space-y-2">
        {items.map((item) => (
          <ChecklistItemRow key={`${item.stepKey}-${item.evidenceClass}`} item={item} tone={tone} />
        ))}
      </div>
    </div>
  );
}

function ChecklistItemRow({
  item,
  tone,
}: {
  item: ChecklistItem;
  tone: "destructive" | "warning";
}) {
  const borderClass =
    tone === "destructive"
      ? "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10"
      : "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10";

  return (
    <div
      className={cn(
        "flex items-start justify-between gap-2 p-2.5 rounded-lg border text-xs",
        borderClass,
      )}
    >
      <div className="flex-1">
        <span className="font-medium text-slate-800 dark:text-slate-200">
          {item.displayName}
        </span>
        <span className="text-slate-500 dark:text-slate-400 ml-1.5">
          {item.stepTitle} · {item.capturedCount}/{item.requiredCount} captured
          {item.averageQaScore !== null && ` · QA ${item.averageQaScore}`}
        </span>
        {item.s500Ref && (
          <span className="block text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
            {item.s500Ref}
          </span>
        )}
      </div>
      {item.riskTier >= 2 && (
        <Badge variant="outline" className="flex-shrink-0">
          Tier {item.riskTier}
        </Badge>
      )}
    </div>
  );
}
