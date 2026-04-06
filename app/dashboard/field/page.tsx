"use client";

/**
 * RA-440: Field dashboard — /dashboard/field
 *
 * Mobile-first landing page for on-site technicians.
 * Shows today's active jobs, quick-start buttons, and recent activity.
 * Designed for Capacitor WebView on Android + iOS.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  MapPin,
  Droplets,
  Clock,
  Mic,
  Camera,
  ChevronRight,
  Plus,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MobileNav } from "@/components/mobile/MobileNav";
import { Badge } from "@/components/ui/badge";
import { format, isToday, isYesterday } from "date-fns";

interface ActiveInspection {
  id: string;
  inspectionNumber: string;
  propertyAddress: string;
  status: string;
  inspectionDate: string;
  moistureReadingCount: number;
  criticalMissing: number;
  readyToLeave: boolean;
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "text-white/50",
  SUBMITTED: "text-amber-400",
  PROCESSING: "text-blue-400",
  CLASSIFIED: "text-purple-400",
  SCOPED: "text-cyan-400",
  COMPLETED: "text-green-400",
};

function formatInspectionDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "d MMM");
}

export default function FieldDashboardPage() {
  const [inspections, setInspections] = useState<ActiveInspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [greeting, setGreeting] = useState("Good morning");

  useEffect(() => {
    const h = new Date().getHours();
    if (h >= 12 && h < 17) setGreeting("Good afternoon");
    else if (h >= 17) setGreeting("Good evening");

    async function loadInspections() {
      try {
        const res = await fetch("/api/inspections?status=DRAFT,SUBMITTED,PROCESSING,CLASSIFIED,SCOPED&take=10");
        if (!res.ok) return;
        const data = await res.json();
        const items = (data.inspections ?? data.data ?? []) as Array<{
          id: string;
          inspectionNumber: string;
          propertyAddress: string;
          status: string;
          inspectionDate: string;
          moistureReadings?: unknown[];
        }>;
        // Enrich with checklist status
        const enriched = await Promise.all(
          items.map(async (insp) => {
            try {
              const clRes = await fetch(`/api/inspections/${insp.id}/voice/checklist`);
              const cl = clRes.ok ? await clRes.json() : { criticalMissing: [], readyToLeave: false };
              return {
                id: insp.id,
                inspectionNumber: insp.inspectionNumber,
                propertyAddress: insp.propertyAddress,
                status: insp.status,
                inspectionDate: insp.inspectionDate,
                moistureReadingCount: insp.moistureReadings?.length ?? 0,
                criticalMissing: cl.criticalMissing?.length ?? 0,
                readyToLeave: cl.readyToLeave ?? false,
              } satisfies ActiveInspection;
            } catch {
              return {
                id: insp.id,
                inspectionNumber: insp.inspectionNumber,
                propertyAddress: insp.propertyAddress,
                status: insp.status,
                inspectionDate: insp.inspectionDate,
                moistureReadingCount: insp.moistureReadings?.length ?? 0,
                criticalMissing: 0,
                readyToLeave: false,
              } satisfies ActiveInspection;
            }
          }),
        );
        setInspections(enriched);
      } finally {
        setLoading(false);
      }
    }
    loadInspections();
  }, []);

  const activeJobs = inspections.filter((i) =>
    ["DRAFT", "SUBMITTED", "PROCESSING", "CLASSIFIED", "SCOPED"].includes(i.status),
  );

  return (
    <div className="min-h-screen bg-[#050505] text-white pb-24">
      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <p className="text-white/50 text-sm">{greeting}</p>
        <h1 className="text-2xl font-bold text-white">Field Dashboard</h1>
        <p className="text-white/40 text-sm mt-0.5">
          {activeJobs.length} active job{activeJobs.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Quick actions */}
      <div className="px-4 mb-6">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "New Job", icon: Plus, href: "/dashboard/inspections/new", color: "bg-[#1C2E47]" },
            { label: "Voice", icon: Mic, href: "#active", color: "bg-[#8A6B4E]/30" },
            { label: "Camera", icon: Camera, href: "#active", color: "bg-white/5" },
          ].map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className={cn(
                "flex flex-col items-center justify-center gap-2 py-4 rounded-2xl text-sm font-medium text-white transition-all active:scale-95",
                action.color,
              )}
            >
              <action.icon className="h-6 w-6" />
              {action.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Active jobs */}
      <div id="active" className="px-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-white/40 uppercase tracking-wider">Active jobs</p>
          <Link href="/dashboard/inspections" className="text-xs text-[#D4A574]">
            All jobs
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <RefreshCw className="h-5 w-5 text-white/30 animate-spin" />
          </div>
        ) : activeJobs.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-white/30 text-sm mb-4">No active jobs</p>
            <Link
              href="/dashboard/inspections/new"
              className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-[#1C2E47] text-white text-sm font-medium"
            >
              <Plus className="h-4 w-4" />
              Start new inspection
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {activeJobs.map((insp) => (
              <Link
                key={insp.id}
                href={`/dashboard/inspections/${insp.id}/field`}
                className="block bg-white/5 rounded-2xl p-4 hover:bg-white/8 active:scale-[0.98] transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-white/40">{insp.inspectionNumber}</span>
                      <span className={cn("text-xs font-medium", STATUS_COLOR[insp.status])}>
                        {insp.status}
                      </span>
                    </div>
                    <p className="font-medium text-white text-sm leading-snug">{insp.propertyAddress}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-white/40">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatInspectionDate(insp.inspectionDate)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Droplets className="h-3 w-3" />
                        {insp.moistureReadingCount} readings
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {insp.readyToLeave ? (
                      <CheckCircle2 className="h-5 w-5 text-green-400" />
                    ) : insp.criticalMissing > 0 ? (
                      <div className="flex items-center gap-1 text-amber-400">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="text-xs font-bold">{insp.criticalMissing}</span>
                      </div>
                    ) : null}
                    <ChevronRight className="h-4 w-4 text-white/20" />
                  </div>
                </div>

                {/* Field shortcuts */}
                <div className="flex gap-2 mt-3 pt-3 border-t border-white/10">
                  <Link
                    href={`/dashboard/inspections/${insp.id}/field`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1C2E47]/60 text-xs text-white/70 hover:bg-[#1C2E47] active:scale-95 transition-all"
                  >
                    <Droplets className="h-3 w-3" />
                    Readings
                  </Link>
                  <Link
                    href={`/dashboard/inspections/${insp.id}/voice`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-xs text-white/60 hover:bg-white/10 active:scale-95 transition-all"
                  >
                    <Mic className="h-3 w-3" />
                    Voice
                  </Link>
                  <Link
                    href={`/dashboard/inspections/${insp.id}/photos`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-xs text-white/60 hover:bg-white/10 active:scale-95 transition-all"
                  >
                    <Camera className="h-3 w-3" />
                    Photos
                  </Link>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <MobileNav />
    </div>
  );
}
