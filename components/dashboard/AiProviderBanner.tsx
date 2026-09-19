"use client";

/**
 * Persistent guidance when the workspace has no operating AI key — or a
 * stored key that failed validation (RA-7428).
 *
 * Report generation hard-402s without a workspace BYOK key. The onboarding
 * status API already marks `ai_provider` required; this banner is the
 * returning-user surface so that is not only visible behind `?welcome=1`.
 *
 * When `rejectedKey` is set, this is the only warning: AiKeySetupBanner
 * hides so the user is not told to "add a key" they already have.
 *
 * Guidance, not a gate: never blocks navigation. Renders nothing until the
 * status call succeeds, and nothing if the call fails.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { RAIcon } from "@/components/brand/RAIcon";
import type { OnboardingStatusResponse } from "@/lib/onboarding/steps";

const DEFAULT_AI_PROVIDER_ROUTE = "/dashboard/settings/ai-providers";

const HIDE_ON_PREFIXES = [
  DEFAULT_AI_PROVIDER_ROUTE,
  "/dashboard/onboarding",
] as const;

function shouldShow(data: OnboardingStatusResponse): boolean {
  const step = data.steps?.ai_provider;
  return Boolean(step && step.required && !step.completed);
}

function isRejectedKey(data: OnboardingStatusResponse): boolean {
  return Boolean(data.steps?.ai_provider?.rejectedKey);
}

export function AiProviderBanner() {
  const pathname = usePathname() ?? "";
  const [data, setData] = useState<OnboardingStatusResponse | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/onboarding/status", {
          credentials: "include",
        });
        if (!res.ok) return;
        const json = (await res.json()) as OnboardingStatusResponse;
        if (cancelled) return;
        if (json?.steps && typeof json.steps === "object") {
          setData(json);
        }
      } catch {
        // Fail closed — guidance must not appear from a broken probe.
      } finally {
        if (!cancelled) setResolved(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!resolved || !data || !shouldShow(data)) return null;
  if (HIDE_ON_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return null;
  }

  const rejected = isRejectedKey(data);
  const step = data.steps.ai_provider;

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-amber-500/40 bg-amber-500/10 dark:bg-amber-900/30 dark:border-amber-700/50"
    >
      <div className="max-w-9xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2 min-w-0 text-amber-800 dark:text-amber-200">
          <RAIcon name="report" size={18} decorative className="mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {rejected
                ? step.title
                : "Reports will not generate without an AI key"}
            </p>
            <p className="text-xs text-amber-800/80 dark:text-amber-200/80">
              {rejected
                ? step.description
                : "RestoreAssist runs report generation on your Anthropic or OpenAI key. Until you add one, generating a report fails instead of producing a document."}
            </p>
          </div>
        </div>
        <Link
          href={step.route || DEFAULT_AI_PROVIDER_ROUTE}
          className="px-3 py-1.5 rounded-md text-xs font-semibold transition-colors min-h-[36px] inline-flex items-center bg-amber-500 hover:bg-amber-600 text-white flex-shrink-0"
        >
          {rejected ? "Replace key" : "Add AI key"}
        </Link>
      </div>
    </div>
  );
}
