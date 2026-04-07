"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  CreditCard,
  TrendingUp,
  Calendar,
  ArrowUpRight,
  RefreshCw,
  Zap,
  AlertTriangle,
  CheckCircle,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface ReportLimits {
  baseLimit: number;
  addonReports: number;
  monthlyReportsUsed: number;
  availableReports: number;
  hasUnlimited: boolean;
}

interface TrialStatus {
  isTrialActive: boolean;
  daysRemaining: number;
  hasTrialExpired: boolean;
  creditsRemaining: number | null;
  hasUnlimitedTrial: boolean;
}

interface CreditData {
  creditsRemaining: number | null;
  totalCreditsUsed: number;
  subscriptionStatus: string;
  subscriptionPlan?: string;
  trialEndsAt?: string;
  monthlyResetDate?: string;
  addonReports?: number;
  monthlyReportsUsed?: number;
  reportLimits?: ReportLimits;
  trialStatus?: TrialStatus | null;
}

function formatResetDate(dateStr?: string): string {
  if (!dateStr) {
    // Default: first of next month
    const d = new Date();
    d.setMonth(d.getMonth() + 1, 1);
    return d.toLocaleDateString("en-AU", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-AU", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTrialEnd(dateStr?: string): string {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-AU", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getPlanBadgeClass(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800";
    case "TRIAL":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800";
    case "EXPIRED":
    case "CANCELED":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800";
    case "PAST_DUE":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800";
    default:
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700";
  }
}

function getUsageBarColor(pct: number): string {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-amber-500";
  return "bg-emerald-500";
}

export default function CreditsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [data, setData] = useState<CreditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch("/api/user/profile");
      if (!res.ok) throw new Error("Failed to fetch profile");
      const json = await res.json();
      const p = json.profile;
      setData({
        creditsRemaining: p.creditsRemaining ?? null,
        totalCreditsUsed: p.totalCreditsUsed ?? 0,
        subscriptionStatus: p.subscriptionStatus ?? "TRIAL",
        subscriptionPlan: p.subscriptionPlan,
        trialEndsAt: p.trialEndsAt,
        monthlyResetDate: p.monthlyResetDate,
        addonReports: p.addonReports ?? 0,
        monthlyReportsUsed: p.monthlyReportsUsed ?? 0,
        reportLimits: p.reportLimits ?? null,
        trialStatus: p.trialStatus ?? null,
      });
      setError(null);
    } catch (err) {
      setError("Could not load credit information. Please refresh.");
    } finally {
      setLoading(false);
      if (isRefresh) setRefreshing(false);
    }
  };

  useEffect(() => {
    if (sessionStatus === "authenticated") {
      fetchData();
    } else if (sessionStatus === "unauthenticated") {
      setLoading(false);
    }
  }, [sessionStatus]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    );
  }

  const isUnlimited =
    data?.reportLimits?.hasUnlimited ||
    (data?.subscriptionStatus === "TRIAL" &&
      data?.trialStatus?.hasUnlimitedTrial);

  const isTrial = data?.subscriptionStatus === "TRIAL";
  const isActive = data?.subscriptionStatus === "ACTIVE";
  const isExpiredOrCanceled =
    data?.subscriptionStatus === "EXPIRED" ||
    data?.subscriptionStatus === "CANCELED";

  // Monthly usage figures
  const monthlyUsed =
    data?.reportLimits?.monthlyReportsUsed ??
    data?.monthlyReportsUsed ??
    data?.totalCreditsUsed ??
    0;
  const baseLimit = data?.reportLimits?.baseLimit ?? 0;
  const addonReports =
    data?.reportLimits?.addonReports ?? data?.addonReports ?? 0;
  const totalLimit = baseLimit + addonReports;
  const usagePct =
    totalLimit > 0
      ? Math.min(100, Math.round((monthlyUsed / totalLimit) * 100))
      : 0;
  const nearLimit = usagePct >= 70;

  const showUpgradeCTA =
    isTrial || isExpiredOrCanceled || (isActive && nearLimit);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className={cn(
              "text-2xl font-bold",
              "text-neutral-900 dark:text-slate-50",
            )}
          >
            Credits &amp; Usage
          </h1>
          <p
            className={cn(
              "text-sm mt-1",
              "text-neutral-500 dark:text-slate-400",
            )}
          >
            Track your report credits and monthly usage
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className={cn(
              "p-2 rounded-lg transition-colors",
              "text-neutral-500 hover:text-neutral-700 dark:text-slate-400 dark:hover:text-slate-200",
              "hover:bg-neutral-100 dark:hover:bg-slate-800",
              refreshing && "opacity-50 cursor-not-allowed",
            )}
            title="Refresh"
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          </button>
          <Link
            href="/dashboard/subscription"
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              "bg-blue-600 hover:bg-blue-700 text-white",
            )}
          >
            <ArrowUpRight size={14} />
            Manage Subscription
          </Link>
        </div>
      </div>

      {error && (
        <div
          className={cn(
            "flex items-center gap-2 px-4 py-3 rounded-lg text-sm",
            "bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800",
          )}
        >
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* Current balance card */}
      <div
        className={cn(
          "rounded-2xl p-6",
          "bg-gradient-to-br from-blue-600 to-cyan-600",
          "text-white shadow-lg",
        )}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-blue-100 text-sm font-medium mb-1">
              Current Balance
            </p>
            <p className="text-4xl font-bold">
              {isUnlimited ? "Unlimited" : (data?.creditsRemaining ?? 0)}
            </p>
            {!isUnlimited && (
              <p className="text-blue-100 text-sm mt-1">credits remaining</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <span
              className={cn(
                "inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border",
                getPlanBadgeClass(data?.subscriptionStatus ?? "TRIAL"),
              )}
            >
              {data?.subscriptionStatus ?? "TRIAL"}
              {data?.subscriptionPlan ? ` — ${data.subscriptionPlan}` : ""}
            </span>
            <CreditCard size={32} className="text-blue-200 opacity-60" />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {/* Monthly reports used */}
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-blue-100 text-xs mb-1">This month</p>
            <p className="text-white font-semibold text-lg">
              {monthlyUsed}
              {!isUnlimited && totalLimit > 0 && (
                <span className="text-blue-200 text-sm font-normal">
                  {" "}
                  / {totalLimit}
                </span>
              )}
            </p>
            <p className="text-blue-100 text-xs">reports</p>
          </div>

          {/* Total ever generated */}
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-blue-100 text-xs mb-1">All time</p>
            <p className="text-white font-semibold text-lg">
              {data?.totalCreditsUsed ?? 0}
            </p>
            <p className="text-blue-100 text-xs">reports generated</p>
          </div>

          {/* Reset date */}
          <div className="bg-white/10 rounded-xl p-3 col-span-2 sm:col-span-1">
            <p className="text-blue-100 text-xs mb-1 flex items-center gap-1">
              <Calendar size={11} />
              {isTrial ? "Trial ends" : "Resets"}
            </p>
            <p className="text-white font-semibold text-sm">
              {isTrial
                ? formatTrialEnd(data?.trialEndsAt)
                : formatResetDate(data?.monthlyResetDate)}
            </p>
            {isTrial && data?.trialStatus && (
              <p className="text-blue-100 text-xs mt-0.5">
                {data.trialStatus.daysRemaining > 0
                  ? `${data.trialStatus.daysRemaining} days left`
                  : "Trial expired"}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Usage breakdown */}
      <div
        className={cn(
          "rounded-2xl p-6 space-y-5",
          "bg-white dark:bg-slate-900",
          "border border-neutral-200 dark:border-slate-800",
        )}
      >
        <div className="flex items-center gap-2">
          <TrendingUp size={18} className="text-blue-500" />
          <h2
            className={cn(
              "font-semibold text-lg",
              "text-neutral-900 dark:text-slate-50",
            )}
          >
            Usage Breakdown
          </h2>
        </div>

        {/* Monthly usage bar */}
        {!isUnlimited && totalLimit > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className={cn("text-neutral-600 dark:text-slate-400")}>
                Monthly reports used
              </span>
              <span
                className={cn(
                  "font-medium",
                  usagePct >= 90
                    ? "text-red-600 dark:text-red-400"
                    : usagePct >= 70
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-emerald-600 dark:text-emerald-400",
                )}
              >
                {monthlyUsed} / {totalLimit} ({usagePct}%)
              </span>
            </div>
            <div className="h-3 rounded-full bg-neutral-100 dark:bg-slate-800 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  getUsageBarColor(usagePct),
                )}
                style={{ width: `${usagePct}%` }}
              />
            </div>
          </div>
        )}

        {/* Unlimited indicator */}
        {isUnlimited && (
          <div
            className={cn(
              "flex items-center gap-2 px-4 py-3 rounded-lg text-sm",
              "bg-emerald-50 text-emerald-700 border border-emerald-200",
              "dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800",
            )}
          >
            <CheckCircle size={16} />
            You have unlimited report generation on your current plan.
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Base plan limit */}
          {isActive && baseLimit > 0 && (
            <div
              className={cn(
                "rounded-xl p-4",
                "bg-neutral-50 dark:bg-slate-800/50",
                "border border-neutral-200 dark:border-slate-700",
              )}
            >
              <p
                className={cn(
                  "text-xs font-medium mb-1",
                  "text-neutral-500 dark:text-slate-400",
                )}
              >
                Base plan limit
              </p>
              <p
                className={cn(
                  "text-2xl font-bold",
                  "text-neutral-900 dark:text-slate-50",
                )}
              >
                {baseLimit}
              </p>
              <p
                className={cn(
                  "text-xs mt-1",
                  "text-neutral-500 dark:text-slate-400",
                )}
              >
                reports / month
              </p>
            </div>
          )}

          {/* Addon reports */}
          {(addonReports > 0 || isActive) && (
            <div
              className={cn(
                "rounded-xl p-4",
                "bg-neutral-50 dark:bg-slate-800/50",
                "border border-neutral-200 dark:border-slate-700",
              )}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Zap size={13} className="text-amber-500" />
                <p
                  className={cn(
                    "text-xs font-medium",
                    "text-neutral-500 dark:text-slate-400",
                  )}
                >
                  Addon reports
                </p>
              </div>
              <p
                className={cn(
                  "text-2xl font-bold",
                  "text-neutral-900 dark:text-slate-50",
                )}
              >
                {addonReports}
              </p>
              <p
                className={cn(
                  "text-xs mt-1",
                  "text-neutral-500 dark:text-slate-400",
                )}
              >
                {addonReports === 0 ? "None purchased" : "available this month"}
              </p>
            </div>
          )}

          {/* Total credits used */}
          <div
            className={cn(
              "rounded-xl p-4",
              "bg-neutral-50 dark:bg-slate-800/50",
              "border border-neutral-200 dark:border-slate-700",
            )}
          >
            <p
              className={cn(
                "text-xs font-medium mb-1",
                "text-neutral-500 dark:text-slate-400",
              )}
            >
              Total reports generated
            </p>
            <p
              className={cn(
                "text-2xl font-bold",
                "text-neutral-900 dark:text-slate-50",
              )}
            >
              {data?.totalCreditsUsed ?? 0}
            </p>
            <p
              className={cn(
                "text-xs mt-1",
                "text-neutral-500 dark:text-slate-400",
              )}
            >
              all time
            </p>
          </div>

          {/* Next reset */}
          <div
            className={cn(
              "rounded-xl p-4",
              "bg-neutral-50 dark:bg-slate-800/50",
              "border border-neutral-200 dark:border-slate-700",
            )}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Clock size={13} className="text-blue-500" />
              <p
                className={cn(
                  "text-xs font-medium",
                  "text-neutral-500 dark:text-slate-400",
                )}
              >
                {isTrial ? "Trial ends" : "Monthly reset"}
              </p>
            </div>
            <p
              className={cn(
                "text-base font-bold",
                "text-neutral-900 dark:text-slate-50",
              )}
            >
              {isTrial
                ? formatTrialEnd(data?.trialEndsAt)
                : formatResetDate(data?.monthlyResetDate)}
            </p>
            {isTrial && data?.trialStatus && (
              <p
                className={cn(
                  "text-xs mt-1",
                  "text-neutral-500 dark:text-slate-400",
                )}
              >
                {data.trialStatus.daysRemaining > 0
                  ? `${data.trialStatus.daysRemaining} days remaining`
                  : "Trial period has ended"}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Upgrade CTA */}
      {showUpgradeCTA && (
        <div
          className={cn(
            "rounded-2xl p-6",
            isTrial
              ? "bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-200 dark:from-indigo-950/40 dark:to-blue-950/40 dark:border-indigo-800"
              : isExpiredOrCanceled
                ? "bg-gradient-to-br from-red-50 to-orange-50 border border-red-200 dark:from-red-950/40 dark:to-orange-950/40 dark:border-red-800"
                : "bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 dark:from-amber-950/40 dark:to-yellow-950/40 dark:border-amber-800",
          )}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                  isTrial
                    ? "bg-indigo-100 dark:bg-indigo-900/40"
                    : isExpiredOrCanceled
                      ? "bg-red-100 dark:bg-red-900/40"
                      : "bg-amber-100 dark:bg-amber-900/40",
                )}
              >
                <Zap
                  size={20}
                  className={
                    isTrial
                      ? "text-indigo-600 dark:text-indigo-400"
                      : isExpiredOrCanceled
                        ? "text-red-600 dark:text-red-400"
                        : "text-amber-600 dark:text-amber-400"
                  }
                />
              </div>
              <div>
                <p
                  className={cn(
                    "font-semibold text-sm",
                    isTrial
                      ? "text-indigo-900 dark:text-indigo-200"
                      : isExpiredOrCanceled
                        ? "text-red-900 dark:text-red-200"
                        : "text-amber-900 dark:text-amber-200",
                  )}
                >
                  {isExpiredOrCanceled
                    ? "Your plan has ended — reactivate to keep generating reports"
                    : nearLimit
                      ? "You're approaching your monthly report limit"
                      : "Upgrade for unlimited reports"}
                </p>
                <p
                  className={cn(
                    "text-sm mt-0.5",
                    isTrial
                      ? "text-indigo-700 dark:text-indigo-300"
                      : isExpiredOrCanceled
                        ? "text-red-700 dark:text-red-300"
                        : "text-amber-700 dark:text-amber-300",
                  )}
                >
                  {isExpiredOrCanceled
                    ? "Reactivate your subscription to restore full access."
                    : isTrial
                      ? "Your free trial includes unlimited reports. Upgrade to keep access when your trial ends."
                      : `You've used ${usagePct}% of your monthly limit. Upgrade or buy addon reports.`}
                </p>
              </div>
            </div>
            <Link
              href="/dashboard/subscription"
              className={cn(
                "inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors flex-shrink-0",
                isTrial
                  ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                  : isExpiredOrCanceled
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : "bg-amber-600 hover:bg-amber-700 text-white",
              )}
            >
              {isExpiredOrCanceled ? "Reactivate plan" : "View plans"}
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
