"use client";

/**
 * RA-5039 PR2 — Field Evidence Checklist Panel.
 *
 * Read-only, informational surface for the FieldEvidenceChecklist (RA-5039
 * PR1). Progress-first, collapsible severity sections grouped by workflow
 * step. Never disables or gates submit/generate/sign-off — additive next to
 * the existing hard gates (SubmissionGatePanel, COMPLETED-status report
 * generation).
 */

import { useState, useEffect, useCallback, useId } from "react";
import Link from "next/link";
import { ChevronDown, Camera, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { apiErrorMessage } from "@/lib/api-error-message";
import type {
  ChecklistItem,
  FieldEvidenceChecklist,
} from "@/lib/evidence/field-evidence-checklist";
import {
  areasHref,
  captureHref,
  captureStepHref,
  groupChecklistItemsByStep,
  summarizeChecklistProgress,
} from "@/lib/evidence/field-evidence-checklist-view";

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
          "rounded-xl border border-neutral-200/80 dark:border-slate-700/40 bg-neutral-50/80 dark:bg-slate-900/40 p-5",
          className,
        )}
        aria-busy="true"
        aria-live="polite"
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
        role="alert"
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

  const summary = summarizeChecklistProgress(checklist);
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
  const areaGaps = summary.uniqueAreaGaps;
  const unlinked = checklist.unlinkedEvidence;

  const requiredPct =
    summary.requiredTotal === 0
      ? 100
      : Math.round((summary.requiredPresent / summary.requiredTotal) * 100);
  const recommendedPct =
    summary.recommendedTotal === 0
      ? 100
      : Math.round(
          (summary.recommendedPresent / summary.recommendedTotal) * 100,
        );

  return (
    <section
      className={cn(
        "rounded-xl border border-neutral-200/80 dark:border-slate-700/40 bg-neutral-50/60 dark:bg-slate-900/30 p-5 space-y-4",
        className,
      )}
      aria-labelledby={`field-evidence-checklist-${inspectionId}`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3
              id={`field-evidence-checklist-${inspectionId}`}
              className="text-sm font-semibold text-neutral-800 dark:text-slate-100"
            >
              Field Evidence Checklist
            </h3>
            <Badge variant="secondary" className="font-normal">
              Guidance
            </Badge>
          </div>
          <p className="text-xs text-neutral-500 dark:text-slate-400 max-w-xl">
            Optional completeness check before you sign. Does not block
            sign-off, submission, or report generation.
          </p>
        </div>
        <Link
          href={captureHref(inspectionId)}
          className="text-xs font-medium text-cyan-700 dark:text-cyan-300 hover:underline shrink-0"
        >
          Open capture workflow
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ProgressStat
          label="Required"
          present={summary.requiredPresent}
          total={summary.requiredTotal}
          percent={requiredPct}
          tone={summary.requiredMissing > 0 ? "attention" : "ok"}
        />
        <ProgressStat
          label="Recommended"
          present={summary.recommendedPresent}
          total={summary.recommendedTotal}
          percent={recommendedPct}
          tone={summary.recommendedMissing > 0 ? "soft" : "ok"}
        />
      </div>

      {summary.isGuidanceComplete ? (
        <p className="text-sm text-success-subtle-foreground bg-success-subtle rounded-lg px-3 py-2">
          All required and recommended field evidence has been captured.
        </p>
      ) : (
        <div className="space-y-2">
          {requiredMissing.length > 0 && (
            <ChecklistSection
              title="Required gaps"
              count={requiredMissing.length}
              tone="destructive"
              defaultOpen
              items={requiredMissing}
              inspectionId={inspectionId}
            />
          )}

          {recommendedMissing.length > 0 && (
            <ChecklistSection
              title="Recommended gaps"
              count={recommendedMissing.length}
              tone="warning"
              defaultOpen={requiredMissing.length === 0}
              items={recommendedMissing}
              inspectionId={inspectionId}
            />
          )}

          {weakItems.length > 0 && (
            <ChecklistSection
              title="Weak QA (score under 70)"
              count={weakItems.length}
              tone="warning"
              defaultOpen={false}
              items={weakItems}
              inspectionId={inspectionId}
            />
          )}

          {areaGaps.length > 0 && (
            <AreaGapsSection
              gaps={areaGaps}
              inspectionId={inspectionId}
              defaultOpen={
                requiredMissing.length === 0 && recommendedMissing.length === 0
              }
            />
          )}

          {unlinked.length > 0 && (
            <UnlinkedSection tags={unlinked} defaultOpen={false} />
          )}
        </div>
      )}
    </section>
  );
}

function ProgressStat({
  label,
  present,
  total,
  percent,
  tone,
}: {
  label: string;
  present: number;
  total: number;
  percent: number;
  tone: "ok" | "attention" | "soft";
}) {
  const barClass =
    tone === "ok"
      ? "[&_[data-slot=progress-indicator]]:bg-success"
      : tone === "attention"
        ? "[&_[data-slot=progress-indicator]]:bg-warning"
        : "[&_[data-slot=progress-indicator]]:bg-cyan-600";

  return (
    <div className="rounded-lg border border-neutral-200/70 dark:border-slate-700/50 bg-white/70 dark:bg-slate-900/50 px-3 py-2.5 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-neutral-600 dark:text-slate-300">
          {label}
        </span>
        <span className="text-xs tabular-nums text-neutral-500 dark:text-slate-400">
          {present}/{total} complete
        </span>
      </div>
      <Progress
        value={percent}
        className={cn("h-1.5 bg-neutral-200/80 dark:bg-slate-700", barClass)}
        aria-label={`${label} evidence ${present} of ${total} complete`}
      />
    </div>
  );
}

function ChecklistSection({
  title,
  count,
  tone,
  defaultOpen,
  items,
  inspectionId,
}: {
  title: string;
  count: number;
  tone: "destructive" | "warning";
  defaultOpen: boolean;
  items: ChecklistItem[];
  inspectionId: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();
  const groups = groupChecklistItemsByStep(items);
  const toneText =
    tone === "destructive"
      ? "text-destructive-subtle-foreground"
      : "text-warning-subtle-foreground";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-lg border border-neutral-200/70 dark:border-slate-700/50 bg-white/60 dark:bg-slate-900/40">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 rounded-lg"
            aria-controls={contentId}
          >
            <span className={cn("text-xs font-semibold uppercase tracking-wide", toneText)}>
              {title}
              <span className="ml-1.5 font-normal normal-case tracking-normal text-neutral-500 dark:text-slate-400">
                ({count})
              </span>
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-neutral-400 transition-transform",
                open && "rotate-180",
              )}
              aria-hidden
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent id={contentId}>
          <div className="px-3 pb-3 space-y-3">
            {groups.map((group) => (
              <div key={group.stepKey} className="space-y-1.5">
                <p className="text-[11px] font-medium text-neutral-500 dark:text-slate-400">
                  {group.stepTitle}
                </p>
                <div className="space-y-1.5">
                  {group.items.map((item) => (
                    <ChecklistItemRow
                      key={`${item.stepKey}-${item.evidenceClass}`}
                      item={item}
                      tone={tone}
                      inspectionId={inspectionId}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function ChecklistItemRow({
  item,
  tone,
  inspectionId,
}: {
  item: ChecklistItem;
  tone: "destructive" | "warning";
  inspectionId: string;
}) {
  const borderClass =
    tone === "destructive"
      ? "border-red-100 dark:border-red-900/40"
      : "border-amber-100 dark:border-amber-900/40";
  const href = captureStepHref(inspectionId, item.stepKey);
  const actionLabel =
    item.status === "weak"
      ? `Improve ${item.displayName}`
      : `Capture ${item.displayName}`;

  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 p-2.5 rounded-lg border bg-white dark:bg-slate-950/40 text-xs",
        borderClass,
      )}
    >
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-slate-800 dark:text-slate-200">
            {item.displayName}
          </span>
          {item.riskTier >= 2 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
              Tier {item.riskTier}
            </Badge>
          )}
        </div>
        <p className="text-slate-500 dark:text-slate-400">
          {item.capturedCount}/{item.requiredCount} captured
          {item.averageQaScore !== null && ` · QA ${item.averageQaScore}`}
        </p>
        {item.s500Ref && (
          <p
            className="text-[10px] text-slate-400 dark:text-slate-500 truncate"
            title={item.s500Ref}
          >
            {item.s500Ref}
          </p>
        )}
      </div>
      <Button variant="outline" size="sm" className="h-7 shrink-0 gap-1.5 px-2" asChild>
        <Link href={href}>
          <Camera className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only sm:not-sr-only sm:inline">{actionLabel}</span>
          <span className="sm:hidden" aria-hidden>
            Capture
          </span>
        </Link>
      </Button>
    </div>
  );
}

function AreaGapsSection({
  gaps,
  inspectionId,
  defaultOpen,
}: {
  gaps: { roomZoneId: string; evidenceCount: number }[];
  inspectionId: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-lg border border-neutral-200/70 dark:border-slate-700/50 bg-white/60 dark:bg-slate-900/40">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 rounded-lg"
            aria-controls={contentId}
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:text-slate-300">
              Areas with no evidence
              <span className="ml-1.5 font-normal normal-case tracking-normal text-neutral-500 dark:text-slate-400">
                ({gaps.length})
              </span>
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-neutral-400 transition-transform",
                open && "rotate-180",
              )}
              aria-hidden
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent id={contentId}>
          <div className="px-3 pb-3 space-y-2">
            <p className="text-xs text-neutral-500 dark:text-slate-400">
              Tag at least one photo or moisture reading to each declared area.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {gaps.map((gap) => (
                <Badge key={gap.roomZoneId} variant="outline" className="gap-1">
                  <MapPin className="h-3 w-3" aria-hidden />
                  {gap.roomZoneId}
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="outline" size="sm" className="h-7" asChild>
                <Link href={areasHref(inspectionId)}>Review areas</Link>
              </Button>
              <Button variant="outline" size="sm" className="h-7" asChild>
                <Link href={captureHref(inspectionId)}>Capture evidence</Link>
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function UnlinkedSection({
  tags,
  defaultOpen,
}: {
  tags: string[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-lg border border-neutral-200/70 dark:border-slate-700/50 bg-white/60 dark:bg-slate-900/40">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 rounded-lg"
            aria-controls={contentId}
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-slate-400">
              Unrecognised room tags
              <span className="ml-1.5 font-normal normal-case tracking-normal">
                ({tags.length})
              </span>
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-neutral-400 transition-transform",
                open && "rotate-180",
              )}
              aria-hidden
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent id={contentId}>
          <div className="px-3 pb-3 space-y-2">
            <p className="text-xs text-neutral-500 dark:text-slate-400">
              These tags do not match a declared affected area — rename the tag
              or add the area.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
