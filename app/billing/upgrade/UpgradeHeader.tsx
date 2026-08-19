import Image from "next/image";
import Link from "next/link";

type Reason = "trial-expired" | "credits" | "feature" | "voluntary" | null;

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
  const isHardPaywall =
    reason === "trial-expired" || reason === "credits" || reason === "feature";

  return (
    <header className="mb-10 sm:mb-12">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div className="inline-flex items-center gap-2.5">
          <Image
            src="/logo.png"
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 object-contain"
            priority
          />
          <span className="text-base font-semibold tracking-tight text-foreground">
            RestoreAssist
          </span>
        </div>
        {isHardPaywall ? (
          <Link
            href="/login"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md px-1 py-0.5"
          >
            Switch account
          </Link>
        ) : (
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md px-1 py-0.5"
          >
            Back to account
          </Link>
        )}
      </div>

      <div className="mx-auto max-w-xl text-center sm:text-left">
        {reasonLabel && (
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-brand-bronze dark:text-brand-gold">
            {reasonLabel}
          </p>
        )}
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {headline}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">
          {support}
        </p>
      </div>
    </header>
  );
}
