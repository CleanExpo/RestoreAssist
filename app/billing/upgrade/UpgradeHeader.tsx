import Image from "next/image";
import { cn } from "@/lib/utils";
import {
  simpleDashboardHeroShell,
  simpleDashboardHeroShine,
} from "@/lib/dashboard/simple-dashboard-theme";

type Reason =
  | "trial-expired"
  | "credits"
  | "feature"
  | "voluntary"
  | "canceled"
  | "past-due"
  | null;

type HeroCopy = {
  headline: string;
  support: string;
  /** Short reason line integrated under the headline — not a floating alert box. */
  reasonLabel: string | null;
};

function heroFor(reason: Reason, feature?: string): HeroCopy {
  if (reason === "trial-expired") {
    return {
      headline: "Continue with RestoreAssist",
      support:
        "Your trial has ended. Subscribe to keep inspections, reports, and exports running.",
      reasonLabel: "Trial ended",
    };
  }
  if (reason === "credits") {
    return {
      headline: "Continue with RestoreAssist",
      support:
        "You're out of credits. Subscribe for monthly credits, or buy a one-time top-up from your dashboard.",
      reasonLabel: "Out of credits",
    };
  }
  if (reason === "feature") {
    return {
      headline: "Continue with RestoreAssist",
      support: `Subscribe to the Monthly Plan to use ${feature ?? "this feature"}.`,
      reasonLabel: feature ? `Needs ${feature}` : "Feature access",
    };
  }
  if (reason === "canceled") {
    return {
      headline: "Continue with RestoreAssist",
      support:
        "Your subscription was canceled. Resubscribe to restore inspections, reports, and exports.",
      reasonLabel: "Subscription canceled",
    };
  }
  if (reason === "past-due") {
    return {
      headline: "Continue with RestoreAssist",
      support:
        "We could not process your last payment. Update billing to keep your workspace active.",
      reasonLabel: "Payment past due",
    };
  }
  return {
    headline: "Choose a plan",
    support: "One plan. Full product access. Cancel anytime.",
    reasonLabel: null,
  };
}

/**
 * Page chrome + hero for the hard-paywall upgrade surface.
 * Reason context sits in the composition (eyebrow + support line), not as a
 * crude standalone alert panel.
 */
export default function UpgradeHeader({
  reason,
  feature,
}: {
  reason: Reason;
  feature?: string;
}) {
  const { headline, support, reasonLabel } = heroFor(reason, feature);

  return (
    <header
      className={cn(
        simpleDashboardHeroShell,
        "overflow-hidden sm:p-8 lg:p-10",
      )}
    >
      <div aria-hidden className={simpleDashboardHeroShine} />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 top-0 h-40 w-40 rounded-full bg-cyan-400/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-1/4 h-px w-[120%] bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent"
      />
      <div className="relative space-y-5">
        <div className="inline-flex items-center gap-2.5">
          <Image
            src="/logo.png"
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 object-contain"
            priority
          />
          <span className="text-base font-semibold tracking-tight text-white">
            RestoreAssist
          </span>
        </div>

        <div className="max-w-4xl lg:max-w-none">
          {reasonLabel ? (
            <p className="text-xs font-semibold uppercase tracking-wider text-cyan-200/90">
              {reasonLabel}
            </p>
          ) : (
            <p className="text-xs font-semibold uppercase tracking-wider text-cyan-200/90">
              Billing · Upgrade
            </p>
          )}
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {headline}
          </h1>
          <p className="mt-3 text-base leading-relaxed text-white/65 sm:text-lg">
            {support}
          </p>
        </div>
      </div>
    </header>
  );
}
