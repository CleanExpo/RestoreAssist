"use client"

import { useState, useEffect } from "react"
import { CheckCircle2, Circle, ArrowRight, Loader2, Sparkles } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

interface OnboardingStep {
  completed: boolean
  required: boolean
  title: string
  description: string
  route: string
}

interface OnboardingStepsMap {
  [key: string]: OnboardingStep
}

interface OnboardingData {
  isComplete: boolean
  incompleteSteps: string[]
  steps: OnboardingStepsMap
  nextStep: string | null
}

interface DisplayStep {
  id: string
  title: string
  description: string
  href: string
  time: string
  completed: boolean
  required: boolean
}

const FALLBACK_STEPS: DisplayStep[] = [
  {
    id: "business_profile",
    title: "Complete business profile",
    description: "Add your business name, ABN, address and contact details",
    href: "/dashboard/settings",
    time: "2 min",
    completed: false,
    required: true,
  },
  {
    id: "pricing",
    title: "Configure pricing",
    description: "Set up your cost rates and pricing templates",
    href: "/dashboard/pricing-config",
    time: "5 min",
    completed: false,
    required: true,
  },
  {
    id: "first_report",
    title: "Create your first report",
    description: "Generate a compliance report for a restoration job",
    href: "/dashboard/reports/new",
    time: "10 min",
    completed: false,
    required: false,
  },
  {
    id: "integration",
    title: "Connect an integration",
    description: "Link your accounting or job management software",
    href: "/dashboard/integrations",
    time: "5 min",
    completed: false,
    required: false,
  },
]

// Step time estimates keyed by API step id
const STEP_TIME_MAP: Record<string, string> = {
  business_profile: "2 min",
  pricing_config: "5 min",
  first_report: "10 min",
}

function ProgressRing({
  percentage,
  size = 120,
}: {
  percentage: number
  size?: number
}) {
  const radius = (size - 16) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  const strokeColor =
    percentage === 100
      ? "#10b981" // green
      : percentage >= 50
        ? "#06b6d4" // cyan
        : "#f59e0b" // amber

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={8}
          className="stroke-neutral-200 dark:stroke-slate-700"
        />
        {/* Progress arc */}
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
          style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.4s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-2xl font-bold"
          style={{ color: strokeColor }}
        >
          {percentage}%
        </span>
      </div>
    </div>
  )
}

export default function OnboardingPage() {
  const [loading, setLoading] = useState(true)
  const [steps, setSteps] = useState<DisplayStep[]>([])
  const [isAllDone, setIsAllDone] = useState(false)

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/onboarding/status")
        if (!res.ok) {
          throw new Error("Failed to fetch onboarding status")
        }
        const data: OnboardingData = await res.json()

        // Build display steps from API response
        const apiSteps = data.steps
        const displaySteps: DisplayStep[] = Object.entries(apiSteps).map(
          ([id, step]) => ({
            id,
            title: step.title,
            description: step.description,
            href: step.route,
            time: STEP_TIME_MAP[id] ?? "~5 min",
            completed: step.completed,
            required: step.required,
          })
        )

        // Add extra steps not returned by API
        const apiIds = new Set(displaySteps.map((s) => s.id))
        const extras = FALLBACK_STEPS.filter(
          (s) => !apiIds.has(s.id)
        )

        setSteps([...displaySteps, ...extras])
        setIsAllDone(data.isComplete)
      } catch {
        // Fall back to static list
        setSteps(FALLBACK_STEPS)
        setIsAllDone(false)
      } finally {
        setLoading(false)
      }
    }

    fetchStatus()
  }, [])

  const completedCount = steps.filter((s) => s.completed).length
  const totalCount = steps.length
  const percentage =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 text-cyan-500 animate-spin mx-auto" />
          <p className={cn("text-sm", "text-neutral-600 dark:text-slate-400")}>
            Loading setup guide...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1
          className={cn(
            "text-3xl font-bold tracking-tight",
            "text-neutral-900 dark:text-slate-100"
          )}
        >
          Setup Guide
        </h1>
        <p className={cn("mt-1 text-base", "text-neutral-600 dark:text-slate-400")}>
          {completedCount} of {totalCount} steps complete
        </p>
      </div>

      {/* Progress ring card */}
      <div
        className={cn(
          "rounded-2xl border p-6 flex flex-col sm:flex-row items-center gap-6",
          "bg-white/50 dark:bg-slate-800/50",
          "border-neutral-200 dark:border-slate-700/50",
          "shadow-sm"
        )}
      >
        <ProgressRing percentage={percentage} size={128} />
        <div className="flex-1 text-center sm:text-left">
          {isAllDone ? (
            <>
              <p
                className={cn(
                  "text-lg font-semibold",
                  "text-emerald-600 dark:text-emerald-400"
                )}
              >
                You&apos;re all set!
              </p>
              <p
                className={cn("text-sm mt-1", "text-neutral-600 dark:text-slate-400")}
              >
                Your account is fully configured and ready to use.
              </p>
            </>
          ) : (
            <>
              <p
                className={cn(
                  "text-lg font-semibold",
                  "text-neutral-900 dark:text-slate-100"
                )}
              >
                {percentage < 50
                  ? "Getting started"
                  : percentage < 100
                    ? "Almost there"
                    : "Completed!"}
              </p>
              <p
                className={cn("text-sm mt-1", "text-neutral-600 dark:text-slate-400")}
              >
                Complete the steps below to finish setting up your account.
              </p>
            </>
          )}
        </div>
      </div>

      {/* All done banner */}
      {isAllDone && (
        <div
          className={cn(
            "rounded-2xl border p-6 text-center space-y-3",
            "bg-emerald-50 dark:bg-emerald-900/20",
            "border-emerald-200 dark:border-emerald-700/50"
          )}
        >
          <div className="flex justify-center">
            <Sparkles className="w-10 h-10 text-emerald-500" />
          </div>
          <h2
            className={cn(
              "text-xl font-bold",
              "text-emerald-700 dark:text-emerald-300"
            )}
          >
            You&apos;re all set!
          </h2>
          <p className={cn("text-sm", "text-emerald-600 dark:text-emerald-400")}>
            Your account is fully configured. You&apos;re ready to create reports and
            manage your restoration business.
          </p>
          <Link
            href="/dashboard"
            className={cn(
              "inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors",
              "bg-emerald-600 hover:bg-emerald-700 text-white"
            )}
          >
            Go to Dashboard
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* Steps checklist */}
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
                : "hover:border-cyan-500/40 hover:shadow-sm"
            )}
          >
            {/* Icon */}
            <div className="shrink-0">
              {step.completed ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
              ) : (
                <Circle
                  className={cn(
                    "w-6 h-6",
                    step.required
                      ? "text-amber-400"
                      : "text-neutral-400 dark:text-slate-500"
                  )}
                />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={cn(
                    "font-medium text-sm",
                    step.completed
                      ? "line-through text-neutral-500 dark:text-slate-500"
                      : "text-neutral-900 dark:text-slate-100"
                  )}
                >
                  {step.title}
                </span>
                {step.required && !step.completed && (
                  <span
                    className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium",
                      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    )}
                  >
                    Required
                  </span>
                )}
              </div>
              <p
                className={cn(
                  "text-xs mt-0.5",
                  "text-neutral-500 dark:text-slate-400"
                )}
              >
                {step.description}
              </p>
              <p
                className={cn(
                  "text-xs mt-1",
                  "text-neutral-400 dark:text-slate-500"
                )}
              >
                ~{step.time}
              </p>
            </div>

            {/* Action button */}
            {!step.completed && (
              <Link
                href={step.href}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
                  "bg-cyan-600 hover:bg-cyan-700 text-white"
                )}
              >
                Complete
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
