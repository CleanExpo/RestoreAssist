"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CalendarDays, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardListPageHeader } from "@/app/dashboard/components/DashboardListPageHeader";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarVisit {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: string;
  inspectionId: string;
  inspectionNumber: string;
  propertyAddress: string;
  inspectionStatus: string;
}

// ─── Status colour config (matches list page) ─────────────────────────────────

const STATUS_CHIP: Record<string, { label: string; bg: string; text: string }> =
  {
    DRAFT: {
      label: "Draft",
      bg: "bg-neutral-200 dark:bg-slate-700",
      text: "text-neutral-600 dark:text-slate-300",
    },
    SUBMITTED: {
      label: "Submitted",
      bg: "bg-blue-100 dark:bg-blue-900/40",
      text: "text-blue-700 dark:text-blue-300",
    },
    PROCESSING: {
      label: "Processing",
      bg: "bg-amber-100 dark:bg-amber-900/40",
      text: "text-amber-700 dark:text-amber-300",
    },
    CLASSIFIED: {
      label: "Classified",
      bg: "bg-purple-100 dark:bg-purple-900/40",
      text: "text-purple-700 dark:text-purple-300",
    },
    SCOPED: {
      label: "Scoped",
      bg: "bg-indigo-100 dark:bg-indigo-900/40",
      text: "text-indigo-700 dark:text-indigo-300",
    },
    ESTIMATED: {
      label: "Estimated",
      bg: "bg-teal-100 dark:bg-teal-900/40",
      text: "text-teal-700 dark:text-teal-300",
    },
    COMPLETED: {
      label: "Completed",
      bg: "bg-emerald-100 dark:bg-emerald-900/40",
      text: "text-success",
    },
    REJECTED: {
      label: "Rejected",
      bg: "bg-red-100 dark:bg-red-900/40",
      text: "text-destructive",
    },
  };

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ─── Calendar helpers ─────────────────────────────────────────────────────────

/** Returns the Date for the Monday that starts the calendar grid for the given month/year. */
function getGridStart(year: number, month: number): Date {
  // month is 0-indexed (JS)
  const firstOfMonth = new Date(year, month, 1);
  // getDay(): 0=Sun,1=Mon,...,6=Sat  →  offset to Monday start
  const dayOfWeek = firstOfMonth.getDay(); // 0=Sun
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const gridStart = new Date(year, month, 1 + mondayOffset);
  return gridStart;
}

/** Returns all 42 Date cells (6 rows × 7 cols) for a month grid. */
function buildCalendarCells(year: number, month: number): Date[] {
  const start = getGridStart(year, month);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SkeletonGrid() {
  return (
    <div className="border border-neutral-200 dark:border-slate-700 rounded-xl overflow-hidden">
      {/* header row */}
      <div className="grid grid-cols-7 border-b border-neutral-200 dark:border-slate-700">
        {DAY_HEADERS.map((h) => (
          <div
            key={h}
            className="py-2 text-center text-xs font-semibold text-neutral-400 dark:text-slate-500"
          >
            {h}
          </div>
        ))}
      </div>
      {/* 6 skeleton rows */}
      {Array.from({ length: 6 }).map((_, row) => (
        <div
          key={row}
          className="grid grid-cols-7 border-b border-neutral-200 dark:border-slate-700 last:border-0"
        >
          {Array.from({ length: 7 }).map((_, col) => (
            <div
              key={col}
              className="min-h-[100px] p-2 border-r border-neutral-100 dark:border-slate-800 last:border-0"
            >
              <Skeleton className="h-4 w-5 mb-2 ml-auto" />
              <Skeleton className="h-5 w-full mb-1 rounded" />
              <Skeleton className="h-5 w-3/4 rounded" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

interface VisitChipProps {
  visit: CalendarVisit;
  onClick: () => void;
}

function VisitChip({ visit, onClick }: VisitChipProps) {
  const cfg = STATUS_CHIP[visit.inspectionStatus] ?? STATUS_CHIP.DRAFT;
  const time = new Date(visit.startsAt).toLocaleTimeString("en-AU", {
    hour: "numeric",
    minute: "2-digit",
  });
  const truncatedAddress =
    visit.propertyAddress.length > 18
      ? visit.propertyAddress.slice(0, 18) + "…"
      : visit.propertyAddress;

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${visit.title} · ${visit.inspectionNumber} — ${visit.propertyAddress}`}
      className={cn(
        "w-full text-left text-[11px] font-medium px-1.5 py-0.5 rounded truncate leading-tight transition-opacity hover:opacity-80",
        cfg.bg,
        cfg.text,
      )}
    >
      <span className="opacity-80">{time}</span> {truncatedAddress}
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function InspectionSchedulePage() {
  const router = useRouter();

  // Hydration-safe "today": `new Date()` at render reads the SSR server clock,
  // which can differ from the client at month/timezone boundaries and cause a
  // hydration mismatch. We start with no resolved "today" (so the server and
  // first client render are identical — no ring, neutral month) and resolve the
  // real value client-side in an effect. Once mounted, behaviour is unchanged.
  const [today, setToday] = useState<Date | null>(null);
  const [currentYear, setCurrentYear] = useState<number | null>(null);
  const [currentMonth, setCurrentMonth] = useState<number | null>(null); // 0-indexed
  const [visits, setVisits] = useState<CalendarVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Resolve "today" and the initial month view on the client only.
  useEffect(() => {
    const now = new Date();
    setToday(now);
    setCurrentYear((y) => (y === null ? now.getFullYear() : y));
    setCurrentMonth((m) => (m === null ? now.getMonth() : m));
  }, []);

  const fetchVisits = useCallback(async () => {
    if (currentYear === null || currentMonth === null) return;
    try {
      setLoading(true);
      setLoadError(null);
      const gridStart = getGridStart(currentYear, currentMonth);
      const gridEnd = new Date(gridStart);
      gridEnd.setDate(gridStart.getDate() + 41);
      gridEnd.setHours(23, 59, 59, 999);
      const from = gridStart.toISOString();
      const to = gridEnd.toISOString();
      const res = await fetch(
        `/api/operations/appointments-calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { credentials: "include", cache: "no-store" },
      );
      if (!res.ok) {
        setVisits([]);
        setLoadError("Could not load scheduled visits");
        return;
      }
      const data = await res.json();
      setVisits(data.data ?? []);
    } catch (err) {
      console.error("[Schedule] Failed to fetch visits:", err);
      setVisits([]);
      setLoadError("Could not load scheduled visits");
    } finally {
      setLoading(false);
    }
  }, [currentYear, currentMonth]);

  useEffect(() => {
    void fetchVisits();
  }, [fetchVisits]);

  const visitsByDay = useMemo(() => {
    const map = new Map<string, CalendarVisit[]>();
    for (const visit of visits) {
      const d = new Date(visit.startsAt);
      const key = toDateKey(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(visit);
    }
    return map;
  }, [visits]);

  // Whether the client has resolved the current month view yet.
  const monthResolved = currentYear !== null && currentMonth !== null;

  // Calendar cells for the current month view. Empty until the client resolves
  // the month (server / first client render show no grid, then it mounts in).
  const cells = useMemo(
    () =>
      monthResolved ? buildCalendarCells(currentYear!, currentMonth!) : [],
    [monthResolved, currentYear, currentMonth],
  );

  // Inspections in the currently displayed month (for empty state message)
  const monthHasVisits = useMemo(() => {
    return cells.some((cell) => {
      if (cell.getMonth() !== currentMonth) return false;
      return (visitsByDay.get(toDateKey(cell))?.length ?? 0) > 0;
    });
  }, [cells, currentMonth, visitsByDay]);

  const goToPrevMonth = () => {
    if (currentMonth === null) return;
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => (y === null ? y : y - 1));
    } else {
      setCurrentMonth((m) => (m === null ? m : m - 1));
    }
  };

  const goToNextMonth = () => {
    if (currentMonth === null) return;
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => (y === null ? y : y + 1));
    } else {
      setCurrentMonth((m) => (m === null ? m : m + 1));
    }
  };

  const goToToday = () => {
    const now = today ?? new Date();
    setToday(now);
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth());
  };

  return (
    <div className="space-y-5">
      <DashboardListPageHeader
        title="Job schedule"
        description="Scheduled site visits from each job’s appointments — add visits on the job detail page."
        icon={<CalendarDays className="text-cyan-500" size={26} aria-hidden />}
        primaryAction={
          <div className="inline-flex overflow-hidden rounded-lg border border-neutral-200 text-sm dark:border-slate-700">
            <span
              className="flex min-h-11 items-center gap-1.5 bg-cyan-500 px-3 font-medium text-white"
              aria-current="page"
            >
              <CalendarDays size={14} aria-hidden />
              Calendar
            </span>
            <button
              type="button"
              onClick={() => router.push("/dashboard/inspections")}
              className="flex min-h-11 items-center gap-1.5 px-3 text-neutral-600 hover:bg-neutral-50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <List size={14} aria-hidden />
              List
            </button>
          </div>
        }
        secondaryLinks={[
          { href: "/dashboard", label: "Overview" },
          { href: "/dashboard/inspections", label: "All jobs" },
          {
            href: "/dashboard/operations/completeness-inbox",
            label: "Completeness inbox",
          },
        ]}
      />

      {loadError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {loadError}
          <button
            type="button"
            className="ml-3 underline"
            onClick={() => void fetchVisits()}
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Month navigation ── */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          onClick={goToPrevMonth}
          aria-label="Previous month"
        >
          <ChevronLeft size={16} />
        </Button>

        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white min-w-[160px] text-center">
          {monthResolved ? `${MONTH_NAMES[currentMonth!]} ${currentYear}` : " "}
        </h2>

        <Button
          variant="outline"
          size="icon"
          onClick={goToNextMonth}
          aria-label="Next month"
        >
          <ChevronRight size={16} />
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={goToToday}
          className="ml-1 text-xs"
        >
          Today
        </Button>
      </div>

      {/* ── Calendar grid ── */}
      {loading || !monthResolved ? (
        <SkeletonGrid />
      ) : (
        <>
          <div className="border border-neutral-200 dark:border-slate-700 rounded-xl overflow-hidden select-none">
            {/* Day-of-week header */}
            <div className="grid grid-cols-7 bg-neutral-50 dark:bg-slate-800/60 border-b border-neutral-200 dark:border-slate-700">
              {DAY_HEADERS.map((h) => (
                <div
                  key={h}
                  className="py-2.5 text-center text-xs font-semibold text-neutral-500 dark:text-slate-400 uppercase tracking-wide"
                >
                  {h}
                </div>
              ))}
            </div>

            {/* 6 rows × 7 cols */}
            {Array.from({ length: 6 }).map((_, rowIdx) => (
              <div
                key={rowIdx}
                className="grid grid-cols-7 border-b border-neutral-200 dark:border-slate-700 last:border-0"
              >
                {cells.slice(rowIdx * 7, rowIdx * 7 + 7).map((cell, colIdx) => {
                  const isCurrentMonth = cell.getMonth() === currentMonth;
                  const isToday = today !== null && isSameDay(cell, today);
                  const dayKey = toDateKey(cell);
                  const dayVisits = visitsByDay.get(dayKey) ?? [];
                  const visibleChips = dayVisits.slice(0, 3);
                  const overflowCount = dayVisits.length - visibleChips.length;

                  return (
                    <div
                      key={colIdx}
                      className={cn(
                        "min-h-[100px] p-1.5 border-r border-neutral-100 dark:border-slate-800 last:border-0 flex flex-col gap-1",
                        !isCurrentMonth &&
                          "bg-neutral-50/70 dark:bg-slate-900/30",
                        isToday &&
                          "ring-2 ring-inset ring-cyan-400 dark:ring-cyan-500",
                      )}
                    >
                      {/* Day number */}
                      <span
                        className={cn(
                          "text-xs font-semibold self-end leading-none px-1 py-0.5 rounded-full",
                          isToday
                            ? "bg-cyan-500 text-white"
                            : isCurrentMonth
                              ? "text-neutral-700 dark:text-slate-200"
                              : "text-neutral-300 dark:text-slate-600",
                        )}
                      >
                        {cell.getDate()}
                      </span>

                      {/* Inspection chips */}
                      {visibleChips.map((visit) => (
                        <VisitChip
                          key={visit.id}
                          visit={visit}
                          onClick={() =>
                            router.push(
                              `/dashboard/inspections/${visit.inspectionId}`,
                            )
                          }
                        />
                      ))}

                      {/* Overflow count */}
                      {overflowCount > 0 && (
                        <span className="text-[10px] font-medium text-neutral-400 dark:text-slate-500 px-1">
                          +{overflowCount} more
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Empty month message */}
          {!monthHasVisits && (
            <p className="py-4 text-center text-sm text-neutral-400 dark:text-slate-500">
              No site visits scheduled for {MONTH_NAMES[currentMonth!]}{" "}
              {currentYear}. Open a job and use the Schedule panel to book a
              visit.
            </p>
          )}
        </>
      )}

      {/* ── Status legend ── */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <span className="text-xs font-medium text-neutral-400 dark:text-slate-500 uppercase tracking-wide">
          Legend
        </span>
        {Object.entries(STATUS_CHIP).map(([key, cfg]) => (
          <Badge
            key={key}
            className={cn(
              "text-[10px] font-medium border-0 px-2 py-0.5",
              cfg.bg,
              cfg.text,
            )}
          >
            {cfg.label}
          </Badge>
        ))}
      </div>
    </div>
  );
}
