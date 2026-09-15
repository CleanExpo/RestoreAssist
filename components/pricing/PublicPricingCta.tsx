"use client";

/**
 * RA-7549 — runtime fail-closed public pricing CTA.
 *
 * Same class as RA-7541 `assertCatalogPrice` on checkout: a pack purchase
 * CTA, "Add to Plan", yearly, or USD presentment must not render. The
 * component only accepts a kind; labels and hrefs come from the pinned
 * SSOT. Packs never emit a link.
 */

import Link from "next/link";
import {
  PINNED_PUBLIC_MONTHLY_CTA,
  PINNED_PUBLIC_PACK_NOTE,
  PINNED_PUBLIC_TRIAL_CTA,
  pinPublicPricingCta,
  type PublicPricingCtaKind,
} from "@/lib/signup-pricing-honesty";

const LIVE_KINDS = ["trial", "monthly", "pack"] as const;
type LiveKind = (typeof LIVE_KINDS)[number];

function isLiveKind(kind: PublicPricingCtaKind): kind is LiveKind {
  return (LIVE_KINDS as readonly string[]).includes(kind);
}

export function PublicPricingCta({
  kind,
  className,
}: {
  kind: PublicPricingCtaKind;
  className?: string;
}) {
  if (!isLiveKind(kind)) {
    pinPublicPricingCta({ kind, href: null, label: kind });
  }

  if (kind === "pack") {
    return (
      <p
        data-testid="public-pricing-pack-note"
        className={
          className ??
          "mt-6 text-center text-sm leading-relaxed text-slate-500"
        }
      >
        {PINNED_PUBLIC_PACK_NOTE.label}
      </p>
    );
  }

  const pinned =
    kind === "trial" ? PINNED_PUBLIC_TRIAL_CTA : PINNED_PUBLIC_MONTHLY_CTA;

  return (
    <Link
      href={pinned.href ?? "/signup"}
      className={className}
      data-testid={`public-pricing-cta-${kind}`}
    >
      {pinned.label}
    </Link>
  );
}
