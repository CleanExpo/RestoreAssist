"use client";

/**
 * AI-key setup banner — the one required onboarding step, surfaced persistently.
 *
 * `/api/onboarding/status` returns `ai_provider` as the only REQUIRED step:
 * without a workspace key, report generation returns 402 and a trial cannot
 * produce the thing it was advertised for. The dashboard only redirected to
 * onboarding when the URL carried `?welcome=1` (app/dashboard/page.tsx), so a
 * user who signed up, got distracted and came back the next day saw nothing.
 * `OnboardingModal` is mounted nowhere; `OnboardingGuide` only on
 * pricing-config. Nothing covered the returning user.
 *
 * Follows the TechLicenceBanner pattern: client fetch, render nothing until it
 * knows, never block the dashboard on failure.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import type {
  OnboardingApiStep,
  OnboardingStatusResponse,
} from "@/lib/onboarding/steps";

const FALLBACK_ROUTE = "/dashboard/settings/ai-providers";

export function AiKeySetupBanner() {
  const [step, setStep] = useState<OnboardingApiStep | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/onboarding/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Partial<OnboardingStatusResponse> | null) => {
        if (cancelled) return;
        setStep(data?.steps?.ai_provider ?? null);
      })
      // Never block the dashboard on a status failure — the banner is
      // guidance, not a gate.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Nothing until we know, so a user who has already finished setup never sees
  // a flash of "you can't generate reports".
  if (!step || step.completed) return null;

  return (
    <div className="mx-6 mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-amber-200">
          You can&rsquo;t generate reports yet — add your AI key
        </p>
        <p className="text-xs text-amber-200/80 mt-0.5">
          RestoreAssist runs on your own Anthropic or OpenAI key, so you pay the
          provider directly at cost. It takes about two minutes.
        </p>
      </div>
      <Link
        href={step.route ?? FALLBACK_ROUTE}
        className="flex-shrink-0 rounded px-3 py-1.5 text-sm font-medium border border-amber-500/50 text-amber-100 hover:bg-amber-500/20 transition-colors"
      >
        Add your key
      </Link>
    </div>
  );
}
