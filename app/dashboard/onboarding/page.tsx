import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import OnboardingClient from "./OnboardingClient";

export const dynamic = "force-dynamic";

/**
 * RA-6792: Reconcile first-run surfaces to ONE canonical first step.
 *
 * Three surfaces previously disagreed about step one:
 *   - /setup                       → business profile via the setup wizard
 *   - /dashboard/onboarding        → Settings / Pricing / Reports checklist
 *   - /api/onboarding/first-run    → create an inspection
 *
 * The setup wizard (`/setup`) owns the genuine first action: it is the only
 * surface that hydrates the Organization (legal name, ABN, address) and flips
 * `setupCompletedAt`. The post-setup checklist below is only meaningful once
 * that has happened. So while setup is incomplete we defer to `/setup` rather
 * than show a competing checklist. This removes the divergence WITHOUT touching
 * the signup redirect (owner-gated funnel).
 *
 * Reversible: delete this guard to restore the standalone checklist.
 */
export default async function OnboardingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  // Only the org owner has a setup wizard to complete. Team members
  // (Managers / Technicians) inherit the owner's setup, so they skip the
  // deferral and see the checklist directly.
  const org = await prisma.organization.findFirst({
    where: { ownerId: session.user.id },
    select: { setupCompletedAt: true },
  });

  if (org && !org.setupCompletedAt) {
    redirect("/setup");
  }

  return <OnboardingClient />;
}
