"use client";

/**
 * RA-440: Field mode — /dashboard/inspections/[id]/field
 *
 * Mobile-first inspection interface for on-site use.
 * Claim-type aware: moisture quick-entry only for water jobs (Wave 3).
 */
import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Droplets,
  CheckCircle2,
  AlertCircle,
  Circle,
  Camera,
  Mic,
  FileText,
  ChevronRight,
  RefreshCw,
  ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { QuickMoistureEntry } from "@/components/mobile/QuickMoistureEntry";
import { MobileNav } from "@/components/mobile/MobileNav";
import { Badge } from "@/components/ui/badge";
import {
  moistureReadingsRequired,
  type IicrcClaimType,
} from "@/lib/nir-standards-mapping";

interface PageProps {
  params: Promise<{ id: string }>;
}

interface Inspection {
  id: string;
  inspectionNumber: string;
  propertyAddress: string;
  status: string;
  claimType: string | null;
  photos?: unknown[];
  moistureReadings: Array<{
    id: string;
    location: string;
    moistureLevel: number;
    surfaceType: string;
    recordedAt: string;
  }>;
  classifications: Array<{
    waterCategory: number | null;
    damageClass: number | null;
  }>;
  affectedAreas?: unknown[];
}

interface ChecklistItem {
  id: string;
  label: string;
  s500Section: string;
  priority: number;
  complete: boolean;
  criticalMissing?: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  PROCESSING: "Processing",
  CLASSIFIED: "Classified",
  SCOPED: "Scoped",
  ESTIMATED: "Estimated",
  COMPLETED: "Completed",
  CLOSED: "Closed",
};

type TabId = "readings" | "checklist";

export default function FieldModePage({ params }: PageProps) {
  const { id: inspectionId } = use(params);
  const router = useRouter();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [tab, setTab] = useState<TabId>("checklist");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [readingsSaved, setReadingsSaved] = useState(0);

  const waterClaim = moistureReadingsRequired(
    inspection?.claimType as IicrcClaimType | null | undefined,
  );

  useEffect(() => {
    async function load() {
      setLoadError(null);
      setLoading(true);
      try {
        const [inspRes, checklistRes] = await Promise.all([
          fetch(`/api/inspections/${inspectionId}`),
          fetch(`/api/inspections/${inspectionId}/voice/checklist`),
        ]);
        if (!inspRes.ok) {
          setInspection(null);
          setLoadError("Could not load this inspection");
          return;
        }
        const data = await inspRes.json();
        const next = (data.inspection ?? data) as Inspection;
        setInspection(next);

        const needsMoisture = moistureReadingsRequired(
          next.claimType as IicrcClaimType | null | undefined,
        );
        setTab(needsMoisture ? "readings" : "checklist");

        if (checklistRes.ok) {
          const checklistData = await checklistRes.json();
          setChecklist(checklistData.items ?? []);
        }
      } catch {
        setInspection(null);
        setLoadError("Could not load this inspection");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [inspectionId, readingsSaved]);

  // Non-water: bounce off moisture tab if somehow selected
  useEffect(() => {
    if (!waterClaim && tab === "readings") {
      setTab("checklist");
    }
  }, [waterClaim, tab]);

  const criticalMissing = checklist.filter(
    (i) => !i.complete && i.priority === 1,
  );
  const completedCount = checklist.filter((i) => i.complete).length;
  const readyToLeave = criticalMissing.length === 0 && checklist.length > 0;
  const photoCount = inspection?.photos?.length ?? 0;
  const moistureCount = inspection?.moistureReadings?.length ?? 0;
  const claimLabel = inspection?.claimType
    ? inspection.claimType.charAt(0) +
      inspection.claimType.slice(1).toLowerCase()
    : "Claim not set";

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-canvas flex items-center justify-center">
        <RefreshCw className="h-6 w-6 text-white/30 animate-spin" />
      </div>
    );
  }

  if (loadError || !inspection) {
    return (
      <div className="min-h-screen bg-brand-canvas text-white flex flex-col items-center justify-center gap-4 px-6">
        <p className="text-sm text-white/70 text-center">
          {loadError ?? "Inspection not found"}
        </p>
        <button
          type="button"
          onClick={() => setReadingsSaved((n) => n + 1)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 text-sm hover:bg-white/15"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
        <Link
          href={`/dashboard/inspections/${inspectionId}`}
          className="text-sm text-brand-gold"
        >
          Back to inspection
        </Link>
      </div>
    );
  }

  const tabs: TabId[] = waterClaim
    ? ["readings", "checklist"]
    : ["checklist"];

  return (
    <div className="min-h-screen bg-brand-canvas text-white pb-20">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-brand-canvas/95 backdrop-blur border-b border-white/10">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-xl bg-white/5 text-white/60 hover:text-white active:scale-95"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">
              {inspection.propertyAddress}
            </p>
            <p className="text-xs text-white/40">
              {inspection.inspectionNumber} ·{" "}
              {STATUS_LABEL[inspection.status] ?? inspection.status}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {readyToLeave ? (
              <Badge className="bg-green-700 text-white text-xs">
                Ready to leave
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-amber-500 text-amber-400 text-xs"
              >
                {criticalMissing.length} critical
              </Badge>
            )}
          </div>
        </div>

        {/* Compact evidence readiness */}
        <div className="mx-4 mb-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <p className="text-xs font-medium text-white/80 flex items-center gap-1.5">
              <ClipboardCheck className="h-3.5 w-3.5 text-brand-gold" />
              Field readiness
            </p>
            <span className="text-[10px] uppercase tracking-wide text-white/40">
              {claimLabel}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/55">
            <span>
              Photos{" "}
              <span className="text-white font-medium tabular-nums">
                {photoCount}
              </span>
            </span>
            {waterClaim ? (
              <span>
                Moisture{" "}
                <span className="text-white font-medium tabular-nums">
                  {moistureCount}
                </span>
              </span>
            ) : (
              <span className="text-white/40">Moisture not required</span>
            )}
            <span>
              Checklist{" "}
              <span className="text-white font-medium tabular-nums">
                {completedCount}/{checklist.length || "—"}
              </span>
            </span>
          </div>
        </div>

        {/* Quick action row */}
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto">
          {[
            {
              label: "Photos",
              icon: Camera,
              href: `/dashboard/inspections/${inspectionId}/photos`,
            },
            {
              label: "Voice",
              icon: Mic,
              href: `/dashboard/inspections/${inspectionId}/voice`,
            },
            {
              label: "Report",
              icon: FileText,
              href: `/dashboard/inspections/${inspectionId}`,
            },
          ].map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 text-white/60 text-sm hover:bg-white/10 active:scale-95 transition-all"
            >
              <action.icon className="h-4 w-4" />
              {action.label}
            </Link>
          ))}
        </div>

        {/* Tab bar */}
        <div className="flex border-t border-white/10">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 py-3 text-sm font-medium transition-colors",
                tab === t
                  ? "text-brand-gold border-b-2 border-brand-gold"
                  : "text-white/40 hover:text-white/60",
              )}
            >
              {t === "readings" ? (
                <span className="flex items-center justify-center gap-1.5">
                  <Droplets className="h-4 w-4" />
                  Moisture
                  <span className="ml-1 text-xs bg-white/10 px-1.5 py-0.5 rounded-full">
                    {moistureCount}
                  </span>
                </span>
              ) : (
                <span className="flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  {waterClaim ? "S500 Checklist" : "Field checklist"}
                  <span className="ml-1 text-xs bg-white/10 px-1.5 py-0.5 rounded-full">
                    {completedCount}/{checklist.length}
                  </span>
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="px-4 py-4">
        {tab === "readings" && waterClaim && (
          <div className="space-y-6">
            <QuickMoistureEntry
              inspectionId={inspectionId}
              onSaved={() => setReadingsSaved((n) => n + 1)}
            />

            {moistureCount > 0 ? (
              <div>
                <p className="text-xs text-white/40 uppercase tracking-wider mb-3">
                  Recent readings
                </p>
                <div className="space-y-2">
                  {[...inspection.moistureReadings]
                    .sort(
                      (a, b) =>
                        new Date(b.recordedAt).getTime() -
                        new Date(a.recordedAt).getTime(),
                    )
                    .slice(0, 10)
                    .map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3"
                      >
                        <div>
                          <p className="text-sm font-medium text-white">
                            {r.location}
                          </p>
                          <p className="text-xs text-white/40">{r.surfaceType}</p>
                        </div>
                        <div className="text-right">
                          <p
                            className={cn(
                              "text-lg font-bold tabular-nums",
                              r.moistureLevel > 25
                                ? "text-destructive"
                                : r.moistureLevel > 15
                                  ? "text-amber-400"
                                  : "text-success",
                            )}
                          >
                            {r.moistureLevel}%
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-white/40 text-center py-6">
                No moisture readings yet — add the first reading above.
              </p>
            )}
          </div>
        )}

        {tab === "checklist" && (
          <div id="checklist" className="space-y-3">
            {!waterClaim ? (
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/60 mb-2">
                {claimLabel} claim — moisture readings are not required. Focus
                on photos and claim-type evidence from the full inspection.
              </div>
            ) : null}
            {checklist.length === 0 ? (
              <div className="text-center py-12 text-white/30">
                <p className="text-sm">
                  {waterClaim
                    ? "Start an inspection to see the S500:2021 checklist"
                    : "No field checklist items for this claim type yet"}
                </p>
              </div>
            ) : (
              <>
                <div className="bg-white/5 rounded-xl p-4 mb-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-white/60">
                      {waterClaim ? "S500:2021 completion" : "Checklist"}
                    </span>
                    <span className="font-medium">
                      {completedCount}/{checklist.length}
                    </span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-gold rounded-full transition-all"
                      style={{
                        width: `${(completedCount / checklist.length) * 100}%`,
                      }}
                    />
                  </div>
                  {readyToLeave && (
                    <p className="text-success text-xs mt-2 font-medium">
                      ✓ All critical items complete — safe to leave site
                    </p>
                  )}
                </div>

                {[1, 2, 3].map((priority) => {
                  const items = checklist.filter((i) => i.priority === priority);
                  if (items.length === 0) return null;
                  return (
                    <div key={priority} className="space-y-2">
                      <p className="text-xs text-white/40 uppercase tracking-wider pt-2">
                        Priority {priority}
                      </p>
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className={cn(
                            "flex items-start gap-3 rounded-xl px-4 py-3",
                            item.complete ? "bg-white/5" : "bg-white/[0.07]",
                          )}
                        >
                          {item.complete ? (
                            <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
                          ) : priority === 1 ? (
                            <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                          ) : (
                            <Circle className="h-5 w-5 text-white/25 shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p
                              className={cn(
                                "text-sm",
                                item.complete
                                  ? "text-white/50 line-through"
                                  : "text-white",
                              )}
                            >
                              {item.label}
                            </p>
                            <p className="text-xs text-white/30 mt-0.5">
                              {item.s500Section}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </>
            )}

            <Link
              href={`/dashboard/inspections/${inspectionId}`}
              className="mt-6 flex items-center justify-center gap-2 py-3 rounded-xl bg-white/5 text-sm text-white/60 hover:bg-white/10"
            >
              Open full inspection
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>

      <MobileNav />
    </div>
  );
}
