"use client";

import { useState, useEffect } from "react";
import {
  CheckCircle2,
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
import { dashboardSurfaceClass } from "@/app/dashboard/components/DashboardPanel";

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
  size = 140,
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
        ? "#d4a574"
        : "#8a6b4e";

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={10}
          className="stroke-neutral-200/80 dark:stroke-white/10"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={10}
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
        <span
          className="text-3xl font-bold tracking-tight tabular-nums"
          style={{ color: strokeColor }}
        >
          {percentage}%
        </span>
        <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 dark:text-slate-400">
          complete
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
      <div className="flex min-h-[60vh] w-full items-center justify-center">
        <div className="space-y-4 text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-brand-bronze" />
          <p className="text-sm text-neutral-600 dark:text-slate-400">
            Loading your workspace checklist…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-none space-y-8 pb-10 lg:space-y-10">
      {/* Hero — full width of dashboard main */}
      <header className="relative overflow-hidden rounded-2xl border border-brand-navy/20 bg-linear-to-br from-brand-navy via-brand-deep to-brand-navy px-6 py-8 sm:px-10 sm:py-10 lg:rounded-3xl lg:px-12 lg:py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-brand-gold/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-brand-bronze/20 blur-3xl"
        />
        <div className="relative max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-gold">
            Post-setup checklist
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-[2.5rem] lg:leading-tight">
            Get to your first job
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-white/75 sm:text-lg">
            Setup is complete. Finish the steps below to run a real inspection
            — floor plan, moisture, report, and client delivery — on
            RestoreAssist.
          </p>
        </div>
      </header>

      <BasicReportWithoutKeyCta variant="dark" layout="banner" />

      <div className="grid gap-8 lg:grid-cols-12 lg:gap-10 xl:gap-12">
        {/* Left rail — progress & CTAs */}
        <aside className="space-y-6 lg:col-span-4 xl:col-span-4 lg:sticky lg:top-6 lg:self-start">
          <div
            className={cn(
              "rounded-2xl p-6 sm:p-7",
              dashboardSurfaceClass,
              "shadow-sm",
            )}
          >
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center lg:flex-col lg:items-stretch xl:flex-row xl:items-center">
              <ProgressRing percentage={percentage} size={148} />
              <div className="flex-1 text-center sm:text-left lg:text-center xl:text-left">
                {isAllDone ? (
                  <>
                    <p className="text-lg font-semibold text-success">
                      Workspace ready
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed text-neutral-600 dark:text-slate-400">
                      Required configuration is complete. Head to the dashboard
                      to manage live jobs.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-semibold text-neutral-900 dark:text-slate-100">
                      {completedCount} of {totalCount} steps done
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed text-neutral-600 dark:text-slate-400">
                      Optional steps help quoting and integrations; required
                      steps unlock paid billing features.
                    </p>
                  </>
                )}
              </div>
            </div>

            {isAllDone && (
              <div className="mt-6 border-t border-neutral-200 pt-6 dark:border-slate-700/60">
                <div className="flex flex-col items-center gap-3 text-center">
                  <Sparkles className="h-8 w-8 text-success" aria-hidden />
                  <p className="text-sm font-medium text-success">
                    You&apos;re all set
                  </p>
                  <Link
                    href="/dashboard"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-navy px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-navy/25 transition-colors hover:bg-brand-navy-hover sm:w-auto"
                  >
                    Go to dashboard
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            )}
          </div>

          {nextStep && !nextStep.completed && !isAllDone && (
            <div
              className={cn(
                "rounded-2xl border p-5 sm:p-6",
                "border-brand-bronze/30 bg-brand-gold/10 dark:border-brand-gold/25 dark:bg-brand-gold/5",
              )}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-bronze dark:text-brand-gold">
                Recommended next
              </p>
              <p className="mt-1 text-base font-semibold text-neutral-900 dark:text-slate-100">
                {nextStep.title}
              </p>
              <p className="mt-1 text-sm text-neutral-600 dark:text-slate-400">
                {nextStep.description}
              </p>
              <Link
                href={nextStep.href}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-navy-hover"
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          )}
        </aside>

        {/* Step list — wider column */}
        <section className="min-w-0 lg:col-span-8 xl:col-span-8">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-slate-100">
                Checklist
              </h2>
              <p className="mt-0.5 text-sm text-neutral-500 dark:text-slate-400">
                Work through these at your pace — your progress saves
                automatically.
              </p>
            </div>
            <span className="hidden shrink-0 text-sm font-medium tabular-nums text-brand-slate sm:block">
              {completedCount}/{totalCount}
            </span>
          </div>

          <ul className="space-y-3 sm:space-y-4">
            {steps.map((step, index) => {
              const isNext = step.id === nextStepId && !step.completed;
              return (
                <li key={step.id}>
                  <div
                    className={cn(
                      "rounded-2xl border p-5 transition-all duration-200 sm:flex sm:items-center sm:gap-5 sm:p-6",
                      dashboardSurfaceClass,
                      step.completed
                        ? "opacity-70"
                        : "hover:border-brand-bronze/40 hover:shadow-md dark:hover:border-brand-gold/30",
                      isNext && "ring-2 ring-brand-gold/40 ring-offset-2 ring-offset-background dark:ring-offset-brand-canvas",
                    )}
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-4 sm:items-center">
                      <span
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                          step.completed
                            ? "bg-success-subtle text-success-subtle-foreground"
                            : isNext
                              ? "bg-brand-navy text-brand-gold"
                              : "bg-neutral-100 text-neutral-600 dark:bg-slate-800 dark:text-slate-300",
                        )}
                        aria-hidden
                      >
                        {step.completed ? (
                          <CheckCircle2 className="h-5 w-5 text-success" />
                        ) : (
                          index + 1
                        )}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "text-base font-medium",
                              step.completed
                                ? "text-neutral-500 line-through dark:text-slate-500"
                                : "text-neutral-900 dark:text-slate-100",
                            )}
                          >
                            {step.title}
                          </span>
                          {step.required && !step.completed && (
                            <span className="rounded-full bg-warning-subtle px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warning-subtle-foreground">
                              Required
                            </span>
                          )}
                          {isNext && (
                            <span className="rounded-full border border-brand-gold/50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-bronze dark:text-brand-gold">
                              Up next
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-neutral-600 dark:text-slate-400">
                          {step.description}
                        </p>
                        <p className="mt-1.5 text-xs font-medium text-neutral-400 dark:text-slate-500">
                          ~{step.time}
                        </p>
                      </div>
                    </div>

                    {!step.completed && (
                      <Link
                        href={step.href}
                        className={cn(
                          "mt-4 inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors sm:mt-0 sm:w-auto",
                          isNext
                            ? "bg-brand-navy text-white shadow-md shadow-brand-navy/20 hover:bg-brand-navy-hover"
                            : "border border-brand-navy/20 bg-transparent text-brand-navy hover:bg-brand-navy/5 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800",
                        )}
                      >
                        {step.id === "first_inspection" ? "Start job" : "Open"}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
