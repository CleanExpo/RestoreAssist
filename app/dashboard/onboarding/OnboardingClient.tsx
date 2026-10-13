"use client";

import { useState, useEffect } from "react";
import {
  CheckCircle2,
  Circle,
  ArrowRight,
  Loader2,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  toOnboardingDisplaySteps,
  type OnboardingStatusResponse,
  type OnboardingDisplayStep,
} from "@/lib/onboarding/steps";
import { BasicReportWithoutKeyCta } from "@/components/onboarding/BasicReportWithoutKeyCta";

// Error-path fallback ONLY — aligned with GET /api/onboarding/status keys.
const FALLBACK_STEPS: OnboardingDisplayStep[] = [
  {
    id: "business_profile",
    title: "Business profile",
    description:
      "Legal name, ABN, address and contacts on every report and invoice.",
    href: "/dashboard/settings",
    time: "3 min",
    completed: false,
    required: true,
  },
  {
    id: "pricing_config",
    title: "Pricing & rate card",
    description:
      "Set labour and line-item rates once — estimates and invoices pull from here.",
    href: "/dashboard/pricing-config",
    time: "5 min",
    completed: false,
    required: true,
  },
  {
    id: "first_inspection",
    title: "Create your first job",
    description:
      "Add the property, capture evidence, and draw or import a floor plan.",
    href: "/dashboard/inspections/new",
    time: "5 min",
    completed: false,
    required: false,
  },
  {
    id: "first_report",
    title: "Generate your first report",
    description:
      "Turn captured evidence into an IICRC S500:2021 draft for your review.",
    href: "/dashboard/reports/new",
    time: "10 min",
    completed: false,
    required: false,
  },
];

function ProgressRing({
  percentage,
  size = 120,
}: {
  percentage: number;
  size?: number;
}) {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const strokeColor =
    percentage === 100
      ? "#10b981"
      : percentage >= 50
        ? "#06b6d4"
        : "#f59e0b";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={8}
          className="stroke-neutral-200 dark:stroke-slate-700"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={8}
          stroke={strokeColor}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{
            transition: "stroke-dashoffset 0.6s ease, stroke 0.4s ease",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold" style={{ color: strokeColor }}>
          {percentage}%
        </span>
      </div>
    </div>
  );
}

export default function OnboardingClient() {
  const [loading, setLoading] = useState(true);
  const [steps, setSteps] = useState<OnboardingDisplayStep[]>([]);
  const [isAllDone, setIsAllDone] = useState(false);
  const [nextStepId, setNextStepId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/onboarding/status");
        if (!res.ok) {
          throw new Error("Failed to fetch onboarding status");
        }
        const data: OnboardingStatusResponse = await res.json();

        setSteps(toOnboardingDisplaySteps(data.steps));
        setIsAllDone(data.isComplete);
        setNextStepId(data.nextStep);
      } catch {
        setSteps(FALLBACK_STEPS);
        setIsAllDone(false);
        setNextStepId("business_profile");
      } finally {
        setLoading(false);
      }
    }

    fetchStatus();
  }, []);

  const completedCount = steps.filter((s) => s.completed).length;
  const totalCount = steps.length;
  const percentage =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const nextStep = nextStepId
    ? steps.find((s) => s.id === nextStepId)
    : steps.find((s) => !s.completed);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 text-cyan-500 animate-spin mx-auto" />
          <p className={cn("text-sm", "text-neutral-600 dark:text-slate-400")}>
            Loading your workspace checklist…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1
          className={cn(
            "text-3xl font-bold tracking-tight",
            "text-neutral-900 dark:text-slate-100",
          )}
        >
          Get to your first job
        </h1>
        <p
          className={cn(
            "mt-1 text-base max-w-xl",
            "text-neutral-600 dark:text-slate-400",
          )}
        >
          Setup is complete. Finish the steps below to run a real inspection —
          floor plan, moisture, report, and client delivery — on RestoreAssist.
        </p>
      </div>

      <BasicReportWithoutKeyCta variant="light" />

      {nextStep && !nextStep.completed && !isAllDone && (
        <div
          className={cn(
            "rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3",
            "border-cyan-200 dark:border-cyan-800/50",
            "bg-cyan-50/80 dark:bg-cyan-950/30",
          )}
        >
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-800 dark:text-cyan-300">
              Recommended next
            </p>
            <p className="text-sm font-medium text-neutral-900 dark:text-slate-100 mt-0.5">
              {nextStep.title}
            </p>
            <p className="text-xs text-neutral-600 dark:text-slate-400 mt-0.5">
              {nextStep.description}
            </p>
          </div>
          <Link
            href={nextStep.href}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-cyan-600 hover:bg-cyan-700 text-white shrink-0"
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      <div
        className={cn(
          "rounded-2xl border p-6 flex flex-col sm:flex-row items-center gap-6",
          "bg-white/50 dark:bg-slate-800/50",
          "border-neutral-200 dark:border-slate-700/50",
          "shadow-sm",
        )}
      >
        <ProgressRing percentage={percentage} size={128} />
        <div className="flex-1 text-center sm:text-left">
          {isAllDone ? (
            <>
              <p className={cn("text-lg font-semibold", "text-success")}>
                Workspace ready
              </p>
              <p
                className={cn(
                  "text-sm mt-1",
                  "text-neutral-600 dark:text-slate-400",
                )}
              >
                Required configuration is complete. Head to the dashboard to
                manage live jobs.
              </p>
            </>
          ) : (
            <>
              <p
                className={cn(
                  "text-lg font-semibold",
                  "text-neutral-900 dark:text-slate-100",
                )}
              >
                {completedCount} of {totalCount} steps done
              </p>
              <p
                className={cn(
                  "text-sm mt-1",
                  "text-neutral-600 dark:text-slate-400",
                )}
              >
                Optional steps help quoting and integrations; required steps
                unlock paid billing features.
              </p>
            </>
          )}
        </div>
      </div>

      {isAllDone && (
        <div
          className={cn(
            "rounded-2xl border p-6 text-center space-y-3",
            "bg-emerald-50 dark:bg-emerald-900/20",
            "border-emerald-200 dark:border-emerald-700/50",
          )}
        >
          <div className="flex justify-center">
            <Sparkles className="w-10 h-10 text-success" />
          </div>
          <h2 className={cn("text-xl font-bold", "text-success")}>
            You&apos;re all set
          </h2>
          <p className={cn("text-sm", "text-success")}>
            Open the dashboard to create jobs, run inspections, and send
            reports.
          </p>
          <Link
            href="/dashboard"
            className={cn(
              "inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors",
              "bg-emerald-600 hover:bg-emerald-700 text-white",
            )}
          >
            Go to dashboard
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      <div className="space-y-3">
        {steps.map((step) => (
          <div
            key={step.id}
            className={cn(
              "rounded-xl border p-5 flex flex-col sm:flex-row sm:items-center gap-4 transition-all duration-200",
              "bg-white/50 dark:bg-slate-800/50",
              "border-neutral-200 dark:border-slate-700/50",
              step.completed
                ? "opacity-60"
                : "hover:border-cyan-500/40 hover:shadow-sm",
              step.id === nextStepId && !step.completed
                ? "ring-1 ring-cyan-500/30"
                : "",
            )}
          >
            <div className="shrink-0">
              {step.completed ? (
                <CheckCircle2 className="w-6 h-6 text-success" />
              ) : (
                <Circle
                  className={cn(
                    "w-6 h-6",
                    step.required
                      ? "text-amber-400"
                      : "text-neutral-400 dark:text-slate-500",
                  )}
                />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={cn(
                    "font-medium text-sm",
                    step.completed
                      ? "line-through text-neutral-500 dark:text-slate-500"
                      : "text-neutral-900 dark:text-slate-100",
                  )}
                >
                  {step.title}
                </span>
                {step.required && !step.completed && (
                  <span
                    className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium",
                      "bg-warning-subtle text-warning-subtle-foreground",
                    )}
                  >
                    Required
                  </span>
                )}
              </div>
              <p
                className={cn(
                  "text-xs mt-0.5",
                  "text-neutral-500 dark:text-slate-400",
                )}
              >
                {step.description}
              </p>
              <p
                className={cn(
                  "text-xs mt-1",
                  "text-neutral-400 dark:text-slate-500",
                )}
              >
                ~{step.time}
              </p>
            </div>

            {!step.completed && (
              <Link
                href={step.href}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
                  "bg-cyan-600 hover:bg-cyan-700 text-white",
                )}
              >
                {step.id === "first_inspection" ? "Start job" : "Open"}
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
