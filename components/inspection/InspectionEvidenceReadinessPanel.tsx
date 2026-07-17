"use client";

import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Droplets,
  FileText,
  Layers,
  Shield,
} from "lucide-react";
import type { ElementType } from "react";
import { cn } from "@/lib/utils";
import {
  moistureReadingsRequired,
  type IicrcClaimType,
} from "@/lib/nir-standards-mapping";

export type InspectionEvidenceTab =
  | "overview"
  | "moisture"
  | "areas"
  | "classification"
  | "scope"
  | "costs"
  | "photos";

type ReadinessState = "complete" | "attention" | "not_required";

interface InspectionEvidenceReadinessPanelProps {
  claimType?: string | null;
  status: string;
  photosCount: number;
  moistureReadingsCount: number;
  affectedAreasCount: number;
  classificationsCount: number;
  selectedScopeItemsCount: number;
  costEstimateCount: number;
  totalCost: number;
  onSelectTab: (tab: InspectionEvidenceTab) => void;
}

type ReadinessItem = {
  key: string;
  label: string;
  detail: string;
  state: ReadinessState;
  tab?: InspectionEvidenceTab;
  action?: string;
  icon: ElementType;
};

function formatCurrency(value: number): string {
  return value.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  });
}

export default function InspectionEvidenceReadinessPanel({
  claimType,
  status,
  photosCount,
  moistureReadingsCount,
  affectedAreasCount,
  classificationsCount,
  selectedScopeItemsCount,
  costEstimateCount,
  totalCost,
  onSelectTab,
}: InspectionEvidenceReadinessPanelProps) {
  const waterClaim = moistureReadingsRequired(
    claimType as IicrcClaimType | null | undefined,
  );
  const claimLabel = claimType
    ? claimType.charAt(0) + claimType.slice(1).toLowerCase()
    : "Not set";

  const items: ReadinessItem[] = [
    {
      key: "claim",
      label: "Claim assessment",
      detail: claimType
        ? `${claimLabel} claim locked for evidence collection`
        : "Set the claim type before relying on evidence gates",
      state: claimType ? "complete" : "attention",
      tab: "classification",
      action: claimType ? undefined : "Set claim type",
      icon: Shield,
    },
    {
      key: "photos",
      label: "Photos",
      detail:
        photosCount > 0
          ? `${photosCount} photo${photosCount === 1 ? "" : "s"} captured`
          : "Capture site photos before issuing a package",
      state: photosCount > 0 ? "complete" : "attention",
      tab: "photos",
      action: photosCount > 0 ? undefined : "Add photos",
      icon: Camera,
    },
    {
      key: "areas",
      label: "Affected areas",
      detail:
        affectedAreasCount > 0
          ? `${affectedAreasCount} affected area${affectedAreasCount === 1 ? "" : "s"} recorded`
          : "Record impacted rooms/zones for scope and evidence context",
      state: affectedAreasCount > 0 ? "complete" : "attention",
      tab: "areas",
      action: affectedAreasCount > 0 ? undefined : "Add areas",
      icon: Layers,
    },
    {
      key: "moisture",
      label: "Moisture evidence",
      detail: waterClaim
        ? moistureReadingsCount > 0
          ? `${moistureReadingsCount} moisture reading${moistureReadingsCount === 1 ? "" : "s"} recorded`
          : "Required for water claims — add moisture readings before issue"
        : claimType
          ? `${claimLabel} claim — moisture readings are not required`
          : "Set claim type first — moisture is only required for water claims",
      state: waterClaim
        ? moistureReadingsCount > 0
          ? "complete"
          : "attention"
        : "not_required",
      tab: waterClaim ? "moisture" : undefined,
      action: waterClaim && moistureReadingsCount === 0 ? "Add moisture" : undefined,
      icon: Droplets,
    },
    {
      key: "classification",
      label: "Classification",
      detail:
        classificationsCount > 0
          ? "IICRC classification captured"
          : "Add claim classification before final review",
      state: classificationsCount > 0 ? "complete" : "attention",
      tab: "classification",
      action: classificationsCount > 0 ? undefined : "Classify",
      icon: ClipboardCheck,
    },
    {
      key: "scope",
      label: "Scope & cost",
      detail:
        selectedScopeItemsCount > 0 && costEstimateCount > 0
          ? `${selectedScopeItemsCount} scope item${selectedScopeItemsCount === 1 ? "" : "s"} · ${formatCurrency(totalCost)} estimate`
          : "Complete selected scope and estimate before insurer submission",
      state:
        selectedScopeItemsCount > 0 && costEstimateCount > 0
          ? "complete"
          : "attention",
      tab: selectedScopeItemsCount > 0 ? "costs" : "scope",
      action:
        selectedScopeItemsCount > 0 && costEstimateCount > 0
          ? undefined
          : "Complete scope",
      icon: FileText,
    },
  ];

  const actionableItems = items.filter((item) => item.state !== "not_required");
  const completeCount = actionableItems.filter(
    (item) => item.state === "complete",
  ).length;
  const percent = Math.round((completeCount / actionableItems.length) * 100);
  const nextItem = items.find((item) => item.state === "attention");
  const packageReady = !nextItem && ["COMPLETED", "CLOSED", "ARCHIVED"].includes(status);

  return (
    <section className="rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/60 p-5 space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
            Evidence readiness
          </p>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
            Insurer-ready evidence package
          </h2>
          <p className="text-sm text-neutral-600 dark:text-slate-300 max-w-3xl">
            A single view of what is captured, what still needs attention, and
            why moisture is only required when the claim type calls for it.
          </p>
        </div>

        <div className="rounded-lg border border-neutral-200 dark:border-slate-700 bg-neutral-50 dark:bg-slate-950/50 px-4 py-3 min-w-[180px]">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm text-neutral-500 dark:text-slate-400">
              Ready
            </span>
            <span className="text-2xl font-bold text-neutral-900 dark:text-white">
              {percent}%
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-slate-800">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                percent === 100 ? "bg-success" : "bg-cyan-500",
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-neutral-500 dark:text-slate-400">
            {completeCount}/{actionableItems.length} evidence checks complete
          </p>
        </div>
      </div>

      <div
        className={cn(
          "rounded-lg border px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
          packageReady
            ? "border-success/40 bg-success/10"
            : "border-warning/40 bg-warning/10",
        )}
      >
        <div className="flex items-start gap-3">
          {packageReady ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />
          ) : (
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-500" />
          )}
          <div>
            <p className="text-sm font-semibold text-neutral-900 dark:text-white">
              {packageReady
                ? "Evidence package is ready for issue"
                : nextItem?.label ?? "Final job status still pending"}
            </p>
            <p className="text-sm text-neutral-600 dark:text-slate-300">
              {packageReady
                ? "Photos, claim evidence, scope, and costs are ready for review or export."
                : nextItem?.detail ??
                  "Complete sign-off before treating this as issue-ready."}
            </p>
          </div>
        </div>
        {nextItem?.tab && nextItem.action && (
          <button
            type="button"
            onClick={() => onSelectTab(nextItem.tab!)}
            className="min-h-[44px] px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium"
          >
            {nextItem.action}
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;
          const complete = item.state === "complete";
          const attention = item.state === "attention";
          return (
            <button
              key={item.key}
              type="button"
              disabled={!item.tab}
              onClick={() => item.tab && onSelectTab(item.tab)}
              className={cn(
                "text-left rounded-lg border p-3 min-h-[96px] transition-colors",
                item.tab && "hover:bg-neutral-50 dark:hover:bg-slate-800/60",
                complete &&
                  "border-success/30 bg-success/5 text-neutral-900 dark:text-white",
                attention &&
                  "border-warning/40 bg-warning/10 text-neutral-900 dark:text-white",
                item.state === "not_required" &&
                  "border-neutral-200 dark:border-slate-700/50 bg-neutral-50 dark:bg-slate-950/30 opacity-80",
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full",
                    complete && "bg-success text-white",
                    attention && "bg-warning text-slate-950",
                    item.state === "not_required" &&
                      "bg-neutral-200 text-neutral-600 dark:bg-slate-800 dark:text-slate-300",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="font-medium text-sm">{item.label}</span>
                <span
                  className={cn(
                    "ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium",
                    complete && "bg-success-subtle text-success-subtle-foreground",
                    attention &&
                      "bg-warning-subtle text-warning-subtle-foreground",
                    item.state === "not_required" &&
                      "bg-neutral-200 text-neutral-600 dark:bg-slate-800 dark:text-slate-300",
                  )}
                >
                  {complete
                    ? "Ready"
                    : attention
                      ? "Needs action"
                      : "Not required"}
                </span>
              </div>
              <p className="text-xs text-neutral-600 dark:text-slate-300">
                {item.detail}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
