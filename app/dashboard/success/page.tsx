"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isCapacitorIOS } from "@/lib/capacitor";
import BillingGate from "@/components/capacitor/BillingGate";
import {
  CheckCircle,
  Loader2,
  ArrowRight,
  Zap,
  DollarSign,
  FileText,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import toast from "react-hot-toast";
import { useSession } from "next-auth/react";
import { DashboardListPageHeader } from "@/app/dashboard/components/DashboardListPageHeader";
import { DashboardPageFrame } from "@/app/dashboard/components/DashboardPageFrame";
import { DashboardPanel } from "@/app/dashboard/components/DashboardPanel";
import {
  simpleDashboardHeroShell,
  simpleDashboardHeroShine,
} from "@/lib/dashboard/simple-dashboard-theme";
import { cn } from "@/lib/utils";

// Module-level flag to prevent verification from running multiple times across remounts
let globalVerificationComplete = false;

export default function SuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const { data: session, update } = useSession();
  const addonKey = searchParams.get("addon");
  const isAddonPurchase = !!addonKey;
  // app/api/checkout-lifetime/route.ts returns lifetime buyers with ?lifetime=1.
  const isLifetimeReturn = searchParams.get("lifetime") === "1";
  const [purchasedPlan, setPurchasedPlan] = useState<{
    name: string;
    allowance: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(true);
  const [countdown, setCountdown] = useState(5);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const hasVerifiedRef = useRef(false);
  const isCompletedRef = useRef(false);
  const toastShownRef = useRef(false);
  const timeoutRefs = useRef<NodeJS.Timeout[]>([]);
  const isProcessingRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to safely set state only if not completed
  const safeSetState = (fn: () => void) => {
    if (!isCompletedRef.current && !isProcessingRef.current) {
      fn();
    }
  };

  // Helper to show toast only once
  const showToastOnce = (message: string) => {
    if (!toastShownRef.current && !isCompletedRef.current) {
      toastShownRef.current = true;
      toast.success(message);
    }
  };

  // Helper to mark as completed
  const markCompleted = () => {
    if (!isCompletedRef.current) {
      isCompletedRef.current = true;
      isProcessingRef.current = false;
      globalVerificationComplete = true; // Set global flag to persist across remounts
      setChecking(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    // Only verify once - guard against re-runs (including across remounts)
    if (
      hasVerifiedRef.current ||
      isCompletedRef.current ||
      isProcessingRef.current ||
      globalVerificationComplete
    ) {
      // If globally completed, mark local state as complete too
      if (globalVerificationComplete && !isCompletedRef.current) {
        markCompleted();
      }
      return;
    }

    // Extract session_id once (only on first run)
    if (sessionIdRef.current === null) {
      sessionIdRef.current = searchParams.get("session_id");
    }

    // Mark as processing immediately to prevent concurrent runs
    isProcessingRef.current = true;
    hasVerifiedRef.current = true;

    // Cleanup function to clear timeouts
    const cleanup = () => {
      timeoutRefs.current.forEach((timeout) => clearTimeout(timeout));
      timeoutRefs.current = [];
    };

    const verifyAndUpdateSubscription = async () => {
      // FIRST: Check if subscription is already active before doing anything.
      // Skip this short-circuit for add-on purchases — those need verify to
      // grant FeatureEntitlement even when the base plan is already ACTIVE.
      if (!isAddonPurchase) {
        try {
          const preCheckResponse = await fetch("/api/user/profile");
          if (preCheckResponse.ok) {
            const preCheckData = await preCheckResponse.json();
            if (preCheckData.profile?.subscriptionStatus === "ACTIVE") {
              // Already active, just mark as completed and return
              markCompleted();
              showToastOnce("Subscription activated successfully!");
              cleanup();
              return;
            }
          }
        } catch {
          // Continue with verification if pre-check fails
        }
      }

      // Check if already completed (race condition guard)
      if (isCompletedRef.current) {
        cleanup();
        return;
      }
      try {
        // Get session_id from ref
        const sessionId = sessionIdRef.current;

        // If this is an add-on purchase, fulfill then redirect.
        // Recurring packs (BOOKKEEPING etc.) grant FeatureEntitlement via verify;
        // one-time report packs credit addonReports. Do NOT redirect before verify
        // completes — that race aborted fulfillment on localhost without webhooks.
        if (isAddonPurchase) {
          if (sessionId) {
            try {
              const addonVerifyResponse = await fetch("/api/addons/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId }),
              });

              if (addonVerifyResponse.ok) {
                const addonData = await addonVerifyResponse.json();

                if (isCompletedRef.current) {
                  cleanup();
                  return;
                }

                markCompleted();
                if (addonData.kind === "recurring") {
                  showToastOnce(
                    addonData.name
                      ? `${addonData.name} is now active.`
                      : "Add-on pack activated successfully!",
                  );
                } else {
                  showToastOnce(
                    `Add-on purchase successful! You now have ${addonData.addonReports} additional reports.`,
                  );
                }
                cleanup();
                if (!isCapacitorIOS()) {
                  router.push("/dashboard/subscription?addon=success");
                }
                return;
              }
            } catch (addonError) {
              console.error("Error verifying add-on:", addonError);
            }
          }

          // If no session_id / verify failed, wait briefly for webhook then finish
          try {
            await new Promise((resolve) => setTimeout(resolve, 2000));

            const catalogCheck = await fetch("/api/addons/catalog");
            if (catalogCheck.ok && addonKey) {
              const catalog = await catalogCheck.json();
              if (
                Array.isArray(catalog.owned) &&
                catalog.owned.includes(addonKey)
              ) {
                if (isCompletedRef.current) {
                  cleanup();
                  return;
                }
                markCompleted();
                showToastOnce("Add-on pack activated successfully!");
                cleanup();
                if (!isCapacitorIOS()) {
                  router.push("/dashboard/subscription?addon=success");
                }
                return;
              }
            }

            const profileCheck = await fetch("/api/user/profile?refresh=true");
            if (profileCheck.ok) {
              const profileData = await profileCheck.json();
              const currentAddons = profileData.profile?.addonReports || 0;

              if (currentAddons > 0) {
                if (isCompletedRef.current) {
                  cleanup();
                  return;
                }
                markCompleted();
                showToastOnce(
                  `Add-on purchase successful! You now have ${currentAddons} additional reports.`,
                );
                cleanup();
                if (!isCapacitorIOS()) {
                  router.push("/dashboard/subscription?addon=success");
                }
                return;
              }
            }
          } catch (error) {
            console.error("Error checking add-on status:", error);
          }

          markCompleted();
          showToastOnce(
            "Add-on purchase received! Processing may take a moment. Please refresh the page.",
          );
          cleanup();
          if (!isCapacitorIOS()) {
            router.push("/dashboard/subscription?addon=success");
          }
          return;
        }

        if (!sessionId) {
          // Try checking active subscription directly first
          try {
            const checkResponse = await fetch(
              "/api/check-active-subscription",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
              },
            );

            if (checkResponse.ok) {
              if (isCompletedRef.current) {
                cleanup();
                return;
              }

              const checkData = await checkResponse.json();

              // DON'T call update() here - it causes re-renders/remounts
              // Just mark as completed - session will update naturally
              markCompleted();
              showToastOnce("Subscription activated successfully!");
              cleanup();
              return;
            }
          } catch (error) {
            console.error("Error checking active subscription:", error);
          }

          // Fallback to checking profile
          await checkProfileAndUpdate();
          cleanup();
          return;
        }

        // First, wait a moment for webhook to process (if it fires quickly)
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // Check if completed during wait
        if (isCompletedRef.current) {
          cleanup();
          return;
        }

        // Check current profile status
        const profileResponse = await fetch("/api/user/profile");
        if (profileResponse.ok) {
          const profileData = await profileResponse.json();
          if (profileData.profile.subscriptionStatus === "ACTIVE") {
            // Already updated by webhook
            if (isCompletedRef.current) {
              cleanup();
              return;
            }

            // DON'T call update() - it causes remounts
            markCompleted();
            showToastOnce("Subscription activated successfully!");
            cleanup();
            return;
          }
        }

        // Check again if completed
        if (isCompletedRef.current) {
          cleanup();
          return;
        }

        // If not updated yet, manually verify and update subscription
        const verifyResponse = await fetch("/api/verify-subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });

        if (verifyResponse.ok) {
          if (isCompletedRef.current) {
            cleanup();
            return;
          }

          const verifyData = await verifyResponse.json();

          // DON'T call update() - it causes remounts and infinite loops
          markCompleted();
          showToastOnce("Subscription activated successfully!");
          cleanup();
        } else {
          // If verification fails, try checking active subscription directly
          const errorData = await verifyResponse
            .json()
            .catch(() => ({ error: "Unknown error" }));

          // Check if completed
          if (isCompletedRef.current) {
            cleanup();
            return;
          }

          // Try to find and update subscription by checking Stripe customer
          const checkResponse = await fetch("/api/check-active-subscription", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });

          if (checkResponse.ok) {
            if (isCompletedRef.current) {
              cleanup();
              return;
            }

            const checkData = await checkResponse.json();

            // DON'T call update() - it causes remounts
            markCompleted();
            showToastOnce("Subscription activated successfully!");
            cleanup();
          } else {
            // If that also fails, wait a bit more for webhook
            if (isCompletedRef.current) {
              cleanup();
              return;
            }

            const timeout = setTimeout(async () => {
              if (isCompletedRef.current) return;
              await checkProfileAndUpdate();
            }, 3000);
            timeoutRefs.current.push(timeout);
          }
        }
      } catch (error) {
        console.error("Error verifying subscription:", error);
        // Fallback to checking profile
        if (!isCompletedRef.current) {
          await checkProfileAndUpdate();
        }
        cleanup();
      }
    };

    const checkProfileAndUpdate = async () => {
      // Guard against running if already completed
      if (isCompletedRef.current) {
        cleanup();
        return;
      }

      try {
        const response = await fetch("/api/user/profile");
        if (response.ok && !isCompletedRef.current) {
          const data = await response.json();
          const profile = data.profile;

          if (profile.subscriptionStatus === "ACTIVE") {
            if (isCompletedRef.current) {
              cleanup();
              return;
            }

            // DON'T call update() - it causes remounts
            markCompleted();
            showToastOnce("Subscription activated successfully!");
            cleanup();
          } else {
            // Try one more time after delay
            if (isCompletedRef.current) {
              cleanup();
              return;
            }

            const timeout = setTimeout(async () => {
              if (isCompletedRef.current) {
                cleanup();
                return;
              }

              const retryResponse = await fetch("/api/user/profile");
              if (retryResponse.ok && !isCompletedRef.current) {
                const retryData = await retryResponse.json();
                if (retryData.profile.subscriptionStatus === "ACTIVE") {
                  if (isCompletedRef.current) {
                    cleanup();
                    return;
                  }

                  // DON'T call update() - it causes remounts
                  markCompleted();
                  showToastOnce("Subscription activated successfully!");
                  cleanup();
                } else {
                  if (isCompletedRef.current) {
                    cleanup();
                    return;
                  }
                  markCompleted();
                  showToastOnce(
                    "Payment received! Your subscription is being processed. Please refresh in a moment.",
                  );
                  cleanup();
                }
              } else {
                if (isCompletedRef.current) {
                  cleanup();
                  return;
                }
                markCompleted();
                cleanup();
              }
            }, 3000);
            timeoutRefs.current.push(timeout);
          }
        } else {
          if (isCompletedRef.current) {
            cleanup();
            return;
          }
          markCompleted();
          cleanup();
        }
      } catch (error) {
        console.error("Error checking profile:", error);
        if (isCompletedRef.current) {
          cleanup();
          return;
        }
        markCompleted();
        cleanup();
      }
    };

    verifyAndUpdateSubscription();

    // Return cleanup function
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - effect should run only once on mount, guards prevent re-runs

  // Optional auto-start countdown (inline banner — no modal overlay).
  useEffect(() => {
    if (loading || checking || isAddonPurchase) return;
    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [loading, checking, isAddonPurchase]);

  // RA-7714: once the payment is confirmed, read the plan the account is now
  // on (the profile's effective plan: Lifetime for lifetimeAccess, the
  // owner's plan for a team member) and its allowance. Nothing is stated
  // unless the account is ACTIVE with a positive allowance, and a lifetime
  // return must already show Lifetime (else fulfillment has not landed) —
  // otherwise the page says no plan rather than a wrong one.
  useEffect(() => {
    if (loading || checking || isAddonPurchase) return;
    let cancelled = false;
    fetch("/api/user/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const profile = data?.profile;
        if (cancelled || profile?.subscriptionStatus !== "ACTIVE") return;
        const name = profile.subscriptionPlan;
        const allowance = profile.planReportAllowance;
        if (typeof name !== "string" || !name) return;
        if (typeof allowance !== "number" || allowance <= 0) return;
        if (isLifetimeReturn && name !== "Lifetime") return;
        setPurchasedPlan({ name, allowance });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [loading, checking, isAddonPurchase, isLifetimeReturn]);

  // For add-ons, show a brief processing state while verify runs (then redirect).
  // NOTE: must come AFTER all hooks above — an early return before a hook
  // violates rules-of-hooks and crashes when isAddonPurchase toggles.
  if (isAddonPurchase) {
    return (
      <DashboardPageFrame className="flex min-h-[50vh] items-center justify-center pb-10 pt-2">
        <div className="space-y-4 text-center">
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-cyan-500" />
          <p className="text-muted-foreground">Activating your add-on pack…</p>
        </div>
      </DashboardPageFrame>
    );
  }

  const handleStartSetup = async () => {
    if (isRedirecting) return;
    setIsRedirecting(true);
    await update();
    router.push("/dashboard/integrations?onboarding=true");
  };

  const handleSkipSetup = async () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    await update();
    toast.success(
      "Setup skipped! You can complete it anytime from Settings or the sidebar.",
      {
        duration: 4000,
      },
    );
    // Redirect to dashboard after a moment
    setTimeout(() => {
      router.push("/dashboard");
    }, 1500);
  };

  if (loading || checking) {
    return (
      <DashboardPageFrame className="flex min-h-[50vh] items-center justify-center pb-10 pt-2">
        <div className="space-y-4 text-center">
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-cyan-500" />
          <p className="text-muted-foreground">Processing your subscription…</p>
        </div>
      </DashboardPageFrame>
    );
  }

  const setupSteps = [
    {
      number: 1,
      icon: Zap,
      title: "Connect API Key",
      description:
        "Add your Anthropic API key to enable AI-powered report generation",
      impact: "High Impact",
      impactColor: "text-success",
      impactBg: "bg-emerald-50 dark:bg-emerald-500/10",
      details:
        "Personalizes report generation, enables advanced AI features, and improves report quality",
      route: "/dashboard/integrations?onboarding=true",
      timeEstimate: "2 min",
    },
    {
      number: 2,
      icon: DollarSign,
      title: "Configure Pricing",
      description:
        "Set up your business rates for labour, equipment, and services",
      impact: "High Impact",
      impactColor: "text-success",
      impactBg: "bg-emerald-50 dark:bg-emerald-500/10",
      details:
        "Ensures accurate cost estimations and professional quotes for your clients",
      route: "/dashboard/pricing-config?onboarding=true",
      timeEstimate: "5 min",
    },
    {
      number: 3,
      icon: FileText,
      title: "Create First Report",
      description: "Generate your first professional restoration report",
      impact: "Medium Impact",
      impactColor: "text-blue-600 dark:text-blue-400",
      impactBg: "bg-blue-50 dark:bg-blue-500/10",
      details:
        "Test the system and see how reports are generated with your settings",
      route: "/dashboard/reports/new?onboarding=true",
      timeEstimate: "10 min",
    },
  ];

  const planDetail =
    purchasedPlan &&
    ` Your plan: ${purchasedPlan.name}, with ${purchasedPlan.allowance} inspection reports a month.`;

  return (
    <DashboardPageFrame className="space-y-8 pb-10 pt-2">
      <div className={cn(simpleDashboardHeroShell, "relative")}>
        <div aria-hidden className={simpleDashboardHeroShine} />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/20 ring-1 ring-emerald-400/30">
              <CheckCircle className="h-8 w-8 text-emerald-400" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-cyan-200/90">
                Payment confirmed
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Payment Successful!
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-white/65">
                Thank you for your payment.
                {planDetail ?? " Your workspace is being updated."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleStartSetup()}
            disabled={isRedirecting}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-5 text-sm font-semibold text-white shadow-lg hover:from-blue-500 hover:to-cyan-500 disabled:opacity-50"
          >
            {isRedirecting ? "Opening setup…" : "Start setup"}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <DashboardListPageHeader
        variant="plain"
        title="Complete your setup"
        description="Three quick steps to unlock the full potential of your account. Each takes just a few minutes."
        icon={<Sparkles className="h-7 w-7 text-cyan-500" aria-hidden />}
      />

      <ul className="grid gap-4 lg:grid-cols-1">
        {setupSteps.map((step) => {
          const Icon = step.icon;
          return (
            <li key={step.number}>
              <DashboardPanel className="p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-md">
                      <Icon className="h-6 w-6 text-white" aria-hidden />
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:hidden">
                      Step {step.number}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="hidden text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:block">
                          Step {step.number}
                        </p>
                        <h3 className="text-lg font-semibold text-foreground">
                          {step.title}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {step.description}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-semibold",
                          step.impactBg,
                          step.impactColor,
                        )}
                      >
                        {step.impact}
                      </span>
                    </div>
                    <p className="flex items-start gap-2 text-xs text-muted-foreground">
                      <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {step.details}
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                      <span className="text-xs text-muted-foreground">
                        Est. {step.timeEstimate}
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          await update();
                          router.push(step.route);
                        }}
                        className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-4 text-sm font-medium text-white hover:from-cyan-500 hover:to-blue-500"
                      >
                        Start
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </DashboardPanel>
            </li>
          );
        })}
      </ul>

      <DashboardPanel className="border-cyan-500/20 bg-cyan-500/5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-foreground">
            {countdown > 0 ? (
              <>
                Tip: start with{" "}
                <span className="font-medium">Connect API Key</span> — auto
                countdown {countdown}s until you choose a step.
              </>
            ) : (
              <span className="text-muted-foreground">
                Pick a step above when you&apos;re ready.
              </span>
            )}
          </p>
          <button
            type="button"
            onClick={() => void handleStartSetup()}
            disabled={isRedirecting}
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-cyan-500/40 bg-background px-4 text-sm font-medium text-foreground hover:bg-muted"
          >
            Open integrations setup
          </button>
        </div>
      </DashboardPanel>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => void handleSkipSetup()}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-muted"
        >
          Skip setup — go to overview
        </button>
        <BillingGate fallback={null}>
          <button
            type="button"
            onClick={async () => {
              await update();
              if (!isCapacitorIOS()) {
                router.push("/dashboard/subscription");
              }
            }}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-muted"
          >
            View subscription
          </button>
        </BillingGate>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        You can complete setup anytime from Settings, Integrations, or the
        sidebar.
      </p>
    </DashboardPageFrame>
  );
}
