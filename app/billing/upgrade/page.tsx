import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import UpgradeHeader from "./UpgradeHeader";
import TierGrid from "./TierGrid";
import UpgradeFaq from "./UpgradeFaq";
import BillingGate from "@/components/capacitor/BillingGate";

export const dynamic = "force-dynamic";

type ReasonParam = "trial-expired" | "credits" | "feature" | "voluntary" | null;

function parseReason(input: string | undefined): ReasonParam {
  if (
    input === "trial-expired" ||
    input === "credits" ||
    input === "feature" ||
    input === "voluntary"
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

  const params = await searchParams;
  const reason = parseReason(params.reason);
  const feature = params.feature;
  const cancelled = params.cancelled === "1";

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { subscriptionStatus: true },
  });

  const isCurrentPlan = user.subscriptionStatus === "ACTIVE";

  return (
    <BillingGate>
      <div className="relative min-h-screen bg-background">
        {/* Subtle brand atmosphere — not flat, not decorative noise */}
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(28,46,71,0.35)_0%,transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(212,165,116,0.08)_0%,transparent_50%)]"
          aria-hidden
        />
        <main className="relative mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
          {cancelled && (
            <p
              role="status"
              className="mb-6 rounded-xl border border-border bg-muted/60 px-4 py-3 text-sm text-foreground"
            >
              Checkout cancelled — continue when you&apos;re ready.
            </p>
          )}
          <UpgradeHeader reason={reason} feature={feature} />
          <TierGrid isCurrentPlan={isCurrentPlan} />
          <UpgradeFaq />
        </main>
      </div>
    </BillingGate>
  );
}
