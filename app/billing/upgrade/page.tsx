import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import UpgradeHeader from "./UpgradeHeader";
import TierGrid from "./TierGrid";

export const dynamic = "force-dynamic";

type ReasonParam = "trial-expired" | "credits" | "feature" | "voluntary" | null;

function parseReason(input: string | undefined): ReasonParam {
  if (input === "trial-expired" || input === "credits" || input === "feature" || input === "voluntary") return input;
  return null;
}

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; feature?: string; cancelled?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login?callbackUrl=/billing/upgrade");

  const params = await searchParams;
  const reason = parseReason(params.reason);
  const feature = params.feature;
  const cancelled = params.cancelled === "1";

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { subscriptionStatus: true, subscriptionPlan: true },
  });

  const initialTier = reason === "feature" ? "PREMIUM" : undefined;
  const currentTier =
    user.subscriptionStatus === "ACTIVE" && user.subscriptionPlan
      ? (user.subscriptionPlan as "STANDARD" | "PREMIUM" | "ENTERPRISE")
      : null;

  return (
    <main className="container mx-auto max-w-5xl p-8">
      {cancelled && (
        <p className="mb-4 rounded bg-slate-50 p-3 text-sm text-muted-foreground">
          No problem — continue when you&apos;re ready.
        </p>
      )}
      <UpgradeHeader reason={reason} feature={feature} />
      <TierGrid initialTier={initialTier} currentTier={currentTier} />
    </main>
  );
}
