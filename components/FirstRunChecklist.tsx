"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Circle,
  ChevronRight,
  Sparkles,
  X,
  Loader2,
  PlayCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  FirstRunChecklistResponse,
  FirstRunStep,
} from "@/app/api/onboarding/first-run/route";

interface FirstRunChecklistProps {
  /** If false the sidebar is collapsed — hide the checklist entirely */
  sidebarOpen: boolean;
}

export default function FirstRunChecklist({
  sidebarOpen,
}: FirstRunChecklistProps) {
  const router = useRouter();
  const [data, setData] = useState<FirstRunChecklistResponse | null>(null);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    fetch("/api/onboarding/first-run")
      .then((r) => r.json())
      .then((d: FirstRunChecklistResponse) => setData(d))
      .catch(() => {
        /* silently ignore */
      });
  }, []);

  const handleDismiss = async () => {
    setDismissing(true);
    try {
      await fetch("/api/onboarding/first-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss" }),
      });
      setData((prev) => (prev ? { ...prev, dismissed: true } : prev));
    } catch {
      // silently ignore
    } finally {
      setDismissing(false);
    }
  };

  // Don't render if: sidebar collapsed, still loading, or dismissed
  if (!sidebarOpen || !data || data.dismissed) return null;

  const { steps, completedCount, totalCount, allComplete } = data;
  const progressPct = Math.round((completedCount / totalCount) * 100);

  return (
    <div
      className={cn(
        "mx-2 mb-3 rounded-xl border p-3 text-sm",
        "bg-gradient-to-b from-cyan-50 to-blue-50 dark:from-cyan-950/30 dark:to-blue-950/30",
        "border-cyan-200 dark:border-cyan-800/50",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Sparkles size={14} className="text-cyan-500 flex-shrink-0" />
          <span className="font-semibold text-neutral-800 dark:text-slate-100 text-xs leading-tight">
            Get started
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-cyan-600 dark:text-cyan-400">
            {completedCount}/{totalCount}
          </span>
          {allComplete && (
            <button
              onClick={handleDismiss}
              disabled={dismissing}
              title="Dismiss checklist"
              className="p-0.5 rounded hover:bg-cyan-200/50 dark:hover:bg-cyan-800/50 transition-colors text-neutral-400 hover:text-neutral-600 dark:text-slate-500 dark:hover:text-slate-300"
            >
              {dismissing ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <X size={12} />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1 rounded-full bg-cyan-200/60 dark:bg-cyan-800/40 mb-3">
        <div
          className="h-1 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Steps */}
      <ul className="space-y-1.5 mb-3">
        {steps.map((step: FirstRunStep, i: number) => (
          <li key={step.id}>
            <Link
              href={step.href}
              className={cn(
                "flex items-start gap-2 rounded-lg px-2 py-1.5 transition-all duration-150",
                step.completed
                  ? "opacity-60 cursor-default pointer-events-none"
                  : "hover:bg-cyan-100/70 dark:hover:bg-cyan-900/30 cursor-pointer",
              )}
            >
              <div className="flex-shrink-0 mt-px">
                {step.completed ? (
                  <CheckCircle2 size={14} className="text-emerald-500" />
                ) : (
                  <Circle
                    size={14}
                    className="text-cyan-400 dark:text-cyan-600"
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "text-xs font-medium leading-tight truncate",
                    step.completed
                      ? "line-through text-neutral-400 dark:text-slate-500"
                      : "text-neutral-700 dark:text-slate-200",
                  )}
                >
                  {i + 1}. {step.title}
                </p>
                {!step.completed && (
                  <p className="text-[10px] text-neutral-500 dark:text-slate-400 leading-tight mt-0.5 truncate">
                    {step.description}
                  </p>
                )}
              </div>
              {!step.completed && (
                <ChevronRight
                  size={12}
                  className="flex-shrink-0 mt-1 text-cyan-400 dark:text-cyan-600"
                />
              )}
            </Link>
          </li>
        ))}
      </ul>

      {/* Demo tour CTA */}
      <button
        onClick={() => router.push("/dashboard/demo")}
        className={cn(
          "w-full flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5",
          "text-[10px] font-medium transition-all duration-150",
          "border border-cyan-300 dark:border-cyan-700",
          "text-cyan-700 dark:text-cyan-300",
          "hover:bg-cyan-100 dark:hover:bg-cyan-900/40",
          "hover:border-cyan-400 dark:hover:border-cyan-600",
        )}
      >
        <PlayCircle size={11} className="flex-shrink-0" />
        Take a tour with demo data
      </button>
    </div>
  );
}
