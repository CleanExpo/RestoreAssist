"use client";

/**
 * Wave 2 (W2-1) — deterministic claim pathway checklist from composePathway.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChromeChevronDown, ChromeLayers } from "@/components/brand/chrome-icons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { apiErrorMessage } from "@/lib/api-error-message";
import {
  PATHWAY_SECTIONS,
  type ClaimPathway,
  type PathwaySection,
} from "@/lib/claim-intelligence/types";
import { JOB_TYPE_LABELS } from "@/lib/evidence/workflow-definitions";

const SECTION_LABELS: Record<PathwaySection, string> = {
  safety: "Safety",
  ppe: "PPE",
  standards: "Standards",
  investigate: "Investigate on site",
  evidence: "Evidence",
  scope: "Scope",
  protection: "Protection",
};

export function ClaimPathwayPanel({
  inspectionId,
  className,
}: {
  inspectionId: string;
  className?: string;
}) {
  const [pathway, setPathway] = useState<ClaimPathway | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openSection, setOpenSection] = useState<PathwaySection | null>("safety");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inspections/${inspectionId}/pathway`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPathway(null);
        setError(apiErrorMessage(body) ?? "Could not load claim pathway");
        return;
      }
      setPathway(body.data as ClaimPathway);
    } catch {
      setPathway(null);
      setError("Could not load claim pathway — check your connection");
    } finally {
      setLoading(false);
    }
  }, [inspectionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const bySection = useMemo(() => {
    if (!pathway) return new Map<PathwaySection, ClaimPathway["techPathway"]>();
    const map = new Map<PathwaySection, ClaimPathway["techPathway"]>();
    for (const section of PATHWAY_SECTIONS) {
      map.set(
        section,
        pathway.techPathway.filter((item) => item.section === section),
      );
    }
    return map;
  }, [pathway]);

  if (loading) {
    return (
      <div
        className={cn(
          "rounded-xl border border-neutral-200/80 dark:border-slate-700/40 bg-neutral-50/80 dark:bg-slate-900/40 p-5",
          className,
        )}
        aria-busy="true"
      >
        <div className="flex items-center gap-3">
          <Spinner className="h-5 w-5" />
          <span className="text-sm text-neutral-600 dark:text-slate-400">
            Loading claim pathway…
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          "rounded-xl border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 p-5 space-y-3",
          className,
        )}
      >
        <p className="text-sm text-amber-900 dark:text-amber-200">{error}</p>
        <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!pathway) return null;

  const claimLabel = JOB_TYPE_LABELS[pathway.claimType] ?? pathway.claimType;
  const requiredCount = pathway.techPathway.filter(
    (i) => i.severity === "required",
  ).length;

  return (
    <section
      className={cn(
        "rounded-xl border border-neutral-200/80 dark:border-slate-700/40 bg-white dark:bg-slate-900/50 p-4 sm:p-5 space-y-4",
        className,
      )}
      aria-label="Claim pathway checklist"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <ChromeLayers className="h-4 w-4 text-cyan-700 dark:text-cyan-300" />
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-slate-100">
              Claim pathway
            </h2>
            <Badge variant="secondary" className="text-[11px]">
              {claimLabel}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-neutral-600 dark:text-slate-400 max-w-prose">
            Deterministic checklist for this claim type — confirm on site before
            you sign off. {requiredCount} required steps.
          </p>
        </div>
        <Button size="sm" variant="outline" asChild className="shrink-0">
          <Link href={`/dashboard/inspections/${inspectionId}/capture`}>
            Open capture
          </Link>
        </Button>
      </div>

      <div className="space-y-2">
        {PATHWAY_SECTIONS.map((section) => {
          const items = bySection.get(section) ?? [];
          if (items.length === 0) return null;
          const isOpen = openSection === section;
          return (
            <Collapsible
              key={section}
              open={isOpen}
              onOpenChange={(open) => setOpenSection(open ? section : null)}
            >
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-neutral-200/80 dark:border-slate-700/50 px-3 py-2 text-left text-sm font-medium hover:bg-neutral-50 dark:hover:bg-slate-800/50">
                <span>{SECTION_LABELS[section]}</span>
                <span className="flex items-center gap-2 text-xs text-neutral-500">
                  {items.length} items
                  <ChromeChevronDown
                    className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")}
                  />
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 space-y-2">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-neutral-100 dark:border-slate-800/80 bg-neutral-50/60 dark:bg-slate-900/30 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-neutral-900 dark:text-slate-100">
                        {item.action}
                      </span>
                      {item.severity === "required" && (
                        <Badge className="text-[10px] bg-cyan-600">Required</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-neutral-600 dark:text-slate-400">
                      {item.why}
                    </p>
                    {item.basis.length > 0 && (
                      <p className="mt-1 text-[11px] text-neutral-500 dark:text-slate-500">
                        {item.basis.join(" · ")}
                      </p>
                    )}
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </section>
  );
}