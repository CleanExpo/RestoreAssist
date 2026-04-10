"use client";

import { cn } from "@/lib/utils";
import { ArrowRight, CheckCircle, FileText, Sparkles } from "lucide-react";

interface ReportTypeSelectionProps {
  isTrial: boolean;
  loading: boolean;
  onSelectReportType: (choice: "basic" | "enhanced" | "optimised") => void;
}

export function ReportTypeSelection({
  isTrial,
  loading,
  onSelectReportType,
}: ReportTypeSelectionProps) {
  return (
    <div
      className={cn(
        "p-6 rounded-lg border-2 space-y-6 mt-6",
        "border-cyan-500/50 dark:border-cyan-500/50",
        "bg-cyan-500/10 dark:bg-cyan-500/10",
      )}
    >
      <h3
        className={cn(
          "text-2xl font-semibold mb-4 flex items-center gap-2",
          "text-neutral-900 dark:text-neutral-50",
        )}
      >
        <FileText className="w-6 h-6 text-primary-600 dark:text-primary-400" />
        Select Report Type
      </h3>
      <p className={cn("text-neutral-600 dark:text-neutral-400 mb-6")}>
        Choose the level of detail for your inspection report. Data has been
        saved successfully.
      </p>

      {isTrial && (
        <div
          className={cn(
            "p-4 rounded-lg border mb-4",
            "bg-blue-50 dark:bg-blue-900/20",
            "border-blue-200 dark:border-blue-800",
          )}
        >
          <p
            className={cn("text-sm", "text-neutral-700 dark:text-neutral-300")}
          >
            <strong className={cn("text-neutral-900 dark:text-white")}>
              Free Plan:
            </strong>{" "}
            You can generate Basic reports only. Upgrade to unlock Enhanced and
            Optimised reports.
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {/* Basic */}
        <button
          type="button"
          onClick={() => onSelectReportType("basic")}
          disabled={loading}
          className="p-6 rounded-lg border-2 border-neutral-300 dark:border-neutral-700 hover:border-blue-500 bg-white dark:bg-neutral-900/50 hover:bg-slate-800/50 transition-all text-left group disabled:opacity-50"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
                <FileText className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h4
                  className={cn(
                    "text-xl font-semibold",
                    "text-neutral-900 dark:text-white",
                  )}
                >
                  Basic
                </h4>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Quick Processing
                </p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-neutral-600 dark:text-neutral-400 group-hover:text-blue-400 transition-colors" />
          </div>
          <p className="text-neutral-700 dark:text-neutral-300 mb-4 text-sm">
            Generate report directly with saved data
          </p>
          <div className="space-y-2">
            {[
              "Areas affected",
              "Observations from technician",
              "Equipment deployed",
              "Reference to IICRC standards",
              "Any obvious hazards flagged",
            ].map((feature, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400"
              >
                <CheckCircle className="w-4 h-4" />
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </button>

        {/* Enhanced */}
        <button
          type="button"
          onClick={() => onSelectReportType("enhanced")}
          disabled={loading || isTrial}
          className={cn(
            "p-6 rounded-lg border-2 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 hover:from-cyan-500/20 hover:to-blue-500/20 transition-all text-left group relative disabled:opacity-50",
            isTrial
              ? "border-neutral-300 dark:border-neutral-700 cursor-not-allowed"
              : "border-cyan-500",
          )}
        >
          <div className="absolute top-4 right-4">
            <span className="px-3 py-1 bg-cyan-500 text-white text-xs font-semibold rounded-full">
              RECOMMENDED
            </span>
          </div>
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-cyan-500/30 flex items-center justify-center group-hover:bg-cyan-500/40 transition-colors">
                <Sparkles className="w-6 h-6 text-cyan-300" />
              </div>
              <div>
                <h4
                  className={cn(
                    "text-xl font-semibold",
                    "text-neutral-900 dark:text-white",
                  )}
                >
                  Enhanced
                </h4>
                <p
                  className={cn(
                    "text-sm",
                    "text-neutral-700 dark:text-primary-400",
                  )}
                >
                  Basic + Tier 1
                </p>
              </div>
            </div>
            <ArrowRight
              className={cn(
                "w-5 h-5 transition-colors",
                "text-neutral-700 dark:text-primary-400",
                "group-hover:text-cyan-600 dark:group-hover:text-cyan-300",
              )}
            />
          </div>
          <p className="text-neutral-700 dark:text-neutral-300 mb-4 text-sm">
            {isTrial
              ? "Upgrade required: Enhanced reports are available on paid plans."
              : "Answer Tier 1 critical questions, then generate report"}
          </p>
          <div className="space-y-2">
            {[
              "All Basic Report features",
              "Tier 1: Critical Questions (8 required)",
              "Property type & construction year",
              "Water source & category",
              "Occupancy & hazard assessment",
            ].map((feature, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300"
              >
                <CheckCircle
                  className={cn(
                    "w-4 h-4",
                    "text-neutral-700 dark:text-primary-400",
                  )}
                />
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </button>

        {/* Optimised */}
        <button
          type="button"
          onClick={() => onSelectReportType("optimised")}
          disabled={loading || isTrial}
          className={cn(
            "p-6 rounded-lg border-2 bg-gradient-to-br from-green-500/10 to-emerald-500/10 hover:from-green-500/20 hover:to-emerald-500/20 transition-all text-left group relative disabled:opacity-50",
            isTrial
              ? "border-neutral-300 dark:border-neutral-700 cursor-not-allowed"
              : "border-green-500",
          )}
        >
          <div className="absolute top-4 right-4">
            <span className="px-3 py-1 bg-green-500 text-white text-xs font-semibold rounded-full">
              COMPREHENSIVE
            </span>
          </div>
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-green-500/30 flex items-center justify-center group-hover:bg-green-500/40 transition-colors">
                <CheckCircle className="w-6 h-6 text-green-300" />
              </div>
              <div>
                <h4
                  className={cn(
                    "text-xl font-semibold",
                    "text-neutral-900 dark:text-white",
                  )}
                >
                  Optimised
                </h4>
                <p
                  className={cn(
                    "text-sm",
                    "text-neutral-700 dark:text-green-400",
                  )}
                >
                  Enhanced + Tier 2 + Tier 3
                </p>
              </div>
            </div>
            <ArrowRight
              className={cn(
                "w-5 h-5 transition-colors",
                "text-neutral-700 dark:text-green-400",
                "group-hover:text-green-600 dark:group-hover:text-green-300",
              )}
            />
          </div>
          <p className="text-neutral-700 dark:text-neutral-300 mb-4 text-sm">
            {isTrial
              ? "Upgrade required: Optimised reports are available on paid plans."
              : "Complete all tiers including photo uploads, then generate report"}
          </p>
          <div className="space-y-2">
            {[
              "All Enhanced features",
              "Tier 2: Enhancement Questions (7 optional)",
              "Tier 3: Optimisation Questions (5 optional)",
              "Photo uploads with categorization",
              "Most comprehensive report",
            ].map((feature, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300"
              >
                <CheckCircle
                  className={cn(
                    "w-4 h-4",
                    "text-neutral-700 dark:text-green-400",
                  )}
                />
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </button>
      </div>
    </div>
  );
}
