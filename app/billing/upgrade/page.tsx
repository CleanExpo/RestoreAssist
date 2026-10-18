import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import UpgradeHeader from "./UpgradeHeader";
import TierGrid from "./TierGrid";
import UpgradeFaq from "./UpgradeFaq";
import UpgradeValueBento from "./UpgradeValueBento";
import UpgradeTrustStrip from "./UpgradeTrustStrip";
import CancelledCheckoutNotice from "./CancelledCheckoutNotice";
import BillingGate from "@/components/capacitor/BillingGate";
import OwnerOnlyBillingNotice from "./OwnerOnlyBillingNotice";
import { getOrganizationOwner } from "@/lib/organization-credits";
import { BillingUpgradeShell } from "@/app/dashboard/components/BillingUpgradeShell";

export const dynamic = "force-dynamic";

type ReasonParam =
  | "trial-expired"
  | "credits"
  | "feature"
  | "voluntary"
  | "canceled"
  | "past-due"
  | null;

function parseReason(input: string | undefined): ReasonParam {
  if (
    input === "trial-expired" ||
    input === "credits" ||
    input === "feature" ||
    input === "voluntary" ||
    input === "canceled" ||
    input === "past-due"
  ) {
    return input;
  }
  return null;
}

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{
    reason?: string;
    feature?: string;
    cancelled?: string;
  }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login?callbackUrl=/billing/upgrade");

  // WP-06: billing belongs to the business owner. Staff resolve to the owner's
  // plan and the checkout routes refuse them, so show them a note, not a pay button.
  const ownerId = await getOrganizationOwner(session.user.id);
  if (ownerId !== null && ownerId !== session.user.id) {
    return <OwnerOnlyBillingNotice />;
  }

  const params = await searchParams;
  const reason = parseReason(params.reason);
  const feature = params.feature;
  const cancelled = params.cancelled === "1";

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { subscriptionStatus: true },
  });

  const isCurrentPlan = user.subscriptionStatus === "ACTIVE";

  const isHardPaywall =
    reason === "trial-expired" ||
    reason === "credits" ||
    reason === "feature" ||
    reason === "canceled" ||
    reason === "past-due";

  return (
    <BillingGate>
      <BillingUpgradeShell className="space-y-8 pb-16">
        {cancelled && <CancelledCheckoutNotice />}
        <UpgradeHeader reason={reason} feature={feature} />
        <UpgradeTrustStrip
          backHref={isHardPaywall ? "/login" : "/dashboard"}
          backLabel={isHardPaywall ? "Switch account" : "Back to dashboard"}
        />
        <div className="grid items-start gap-8 lg:grid-cols-12 lg:gap-10">
          <UpgradeValueBento className="lg:col-span-5 xl:col-span-4" />
          <TierGrid
            isCurrentPlan={isCurrentPlan}
            className="lg:col-span-7 xl:col-span-8 lg:sticky lg:top-8"
          />
        </div>
        <UpgradeFaq />
      </BillingUpgradeShell>
    </BillingGate>
  );
}
