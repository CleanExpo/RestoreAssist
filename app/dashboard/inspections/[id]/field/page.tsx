"use client";

/**
 * RA-440: Field mode — /dashboard/inspections/[id]/field
 *
 * Mobile-first inspection interface for on-site use.
 * Optimised for gloved hands, bright outdoor light, one-handed operation.
 * Shows: quick moisture entry, S500 checklist, recent readings, photo capture link.
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { QuickMoistureEntry } from "@/components/mobile/QuickMoistureEntry";
import { MobileNav } from "@/components/mobile/MobileNav";
import { Badge } from "@/components/ui/badge";

interface PageProps {
  params: Promise<{ id: string }>;
}

interface Inspection {
  id: string;
  inspectionNumber: string;
  propertyAddress: string;
  status: string;
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
};

type TabId = "readings" | "checklist";

export default function FieldModePage({ params }: PageProps) {
  const { id: inspectionId } = use(params);
  const router = useRouter();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [tab, setTab] = useState<TabId>("readings");
  const [loading, setLoading] = useState(true);
  const [readingsSaved, setReadingsSaved] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const [inspRes, checklistRes] = await Promise.all([
          fetch(`/api/inspections/${inspectionId}`),
          fetch(`/api/inspections/${inspectionId}/voice/checklist`),
        ]);
        if (inspRes.ok) {
          const data = await inspRes.json();
          setInspection(data.inspection ?? data);
        }
        if (checklistRes.ok) {
          const data = await checklistRes.json();
          setChecklist(data.items ?? []);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [inspectionId, readingsSaved]);

  const criticalMissing = checklist.filter(
    (i) => !i.complete && i.priority === 1,
  );
  const completedCount = checklist.filter((i) => i.complete).length;
  const readyToLeave = criticalMissing.length === 0 && checklist.length > 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <RefreshCw className="h-6 w-6 text-white/30 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white pb-20">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#050505]/95 backdrop-blur border-b border-white/10">
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
              {inspection?.propertyAddress ?? "Loading…"}
            </p>
            <p className="text-xs text-white/40">
              {inspection?.inspectionNumber}
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
          {(["readings", "checklist"] as TabId[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 py-3 text-sm font-medium transition-colors",
                tab === t
                  ? "text-[#D4A574] border-b-2 border-[#D4A574]"
                  : "text-white/40 hover:text-white/60",
              )}
            >
              {t === "readings" ? (
                <span className="flex items-center justify-center gap-1.5">
                  <Droplets className="h-4 w-4" />
                  Moisture
                  {inspection && (
                    <span className="ml-1 text-xs bg-white/10 px-1.5 py-0.5 rounded-full">
                      {inspection.moistureReadings?.length ?? 0}
                    </span>
                  )}
                </span>
              ) : (
                <span className="flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  S500 Checklist
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
        {tab === "readings" && (
          <div className="space-y-6">
            <QuickMoistureEntry
              inspectionId={inspectionId}
              onSaved={() => setReadingsSaved((n) => n + 1)}
            />

            {/* Recent readings */}
            {inspection?.moistureReadings &&
              inspection.moistureReadings.length > 0 && (
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
                            <p className="text-xs text-white/40">
                              {r.surfaceType}
                            </p>
                          </div>
                          <div className="text-right">
                            <p
                              className={cn(
                                "text-lg font-bold tabular-nums",
                                r.moistureLevel > 25
                                  ? "text-red-400"
                                  : r.moistureLevel > 15
                                    ? "text-amber-400"
                                    : "text-green-400",
                              )}
                            >
                              {r.moistureLevel}%
                            </p>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
          </div>
        )}

        {tab === "checklist" && (
          <div id="checklist" className="space-y-3">
            {checklist.length === 0 ? (
              <div className="text-center py-12 text-white/30">
                <p className="text-sm">
                  Start an inspection to see the S500:2025 checklist
                </p>
              </div>
            ) : (
              <>
                {/* Progress bar */}
                <div className="bg-white/5 rounded-xl p-4 mb-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-white/60">S500:2025 completion</span>
                    <span className="font-medium">
                      {completedCount}/{checklist.length}
                    </span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#D4A574] rounded-full transition-all"
                      style={{
                        width: `${(completedCount / checklist.length) * 100}%`,
                      }}
                    />
                  </div>
                  {readyToLeave && (
                    <p className="text-green-400 text-xs mt-2 font-medium">
                      ✓ All critical items complete — safe to leave site
                    </p>
                  )}
                </div>

                {/* Priority 1 items first */}
                {[1, 2, 3].map((priority) => {
                  const items = checklist.filter(
                    (i) => i.priority === priority,
                  );
                  if (!items.length) return null;
                  return (
                    <div key={priority}>
                      <p className="text-xs text-white/30 uppercase tracking-wider mb-2 mt-4">
                        {priority === 1
                          ? "Must complete before leaving"
                          : priority === 2
                            ? "Should complete"
                            : "Nice to have"}
                      </p>
                      <div className="space-y-2">
                        {items.map((item) => (
                          <div
                            key={item.id}
                            className={cn(
                              "flex items-start gap-3 rounded-xl px-4 py-3",
                              item.complete
                                ? "bg-green-900/20"
                                : priority === 1
                                  ? "bg-amber-900/20"
                                  : "bg-white/5",
                            )}
                          >
                            <div className="mt-0.5 shrink-0">
                              {item.complete ? (
                                <CheckCircle2 className="h-5 w-5 text-green-400" />
                              ) : priority === 1 ? (
                                <AlertCircle className="h-5 w-5 text-amber-400" />
                              ) : (
                                <Circle className="h-5 w-5 text-white/20" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
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
                                S500:2025 {item.s500Section}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* Jump to voice */}
            <Link
              href={`/dashboard/inspections/${inspectionId}/voice`}
              className="flex items-center justify-between w-full mt-4 p-4 rounded-xl bg-[#1C2E47]/50 border border-[#1C2E47] text-sm text-white/80 hover:bg-[#1C2E47]/80 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Mic className="h-4 w-4 text-[#D4A574]" />
                Switch to Voice Copilot
              </span>
              <ChevronRight className="h-4 w-4 text-white/40" />
            </Link>
          </div>
        )}
      </div>

      {/* Mobile bottom nav */}
      <MobileNav inspectionId={inspectionId} />
    </div>
  );
}
