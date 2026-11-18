import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { SetupShell } from '@/components/setup/SetupShell';
import { ensureOwnerOrganization } from '@/lib/organization/ensure-owner-organization';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect('/login');
  }

  // Read from the database: a stale cookie must not decide who owns a business.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, needsOnboarding: true, pendingInviteIdentity: true },
  });
  if (!user) {
    redirect('/login');
  }
  if (user.role !== 'ADMIN' || user.pendingInviteIdentity) {
    redirect('/dashboard');
  }
  // Terms come first, so no organisation exists for an owner who has not
  // accepted them. This page renders on a GET, so the write must wait.
  if (user.needsOnboarding) {
    redirect('/onboarding/account-type');
  }

  // The same organisation the session reads, so this page and the setup gate
  // cannot disagree about whether setup is finished.
  const organizationId = await ensureOwnerOrganization(session.user.id);
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      ownerId: true,
      legalName: true,
      tradingName: true,
      country: true,
      abn: true,
      nzbn: true,
      acn: true,
      timezone: true,
      state: true,
      address: true,
      phone: true,
      email: true,
      website: true,
      logoUrl: true,
      primaryColor: true,
      accentColor: true,
      aboutCopy: true,
      tradingStatus: true,
      setupStartedAt: true,
      setupCompletedAt: true,
      pricingConfig: true,
      hydrationJobs: { select: { kind: true, status: true } },
    },
  });

  if (!org || org.setupCompletedAt || org.ownerId !== session.user.id) {
    redirect('/dashboard');
  }

  // Convert Date fields to ISO strings for client component serialization
  // Capture before TypeScript narrows to never after the redirect guard above
  const { setupStartedAt, setupCompletedAt, ownerId: _ownerId, ...orgRest } = org;
  const initial = {
    ...orgRest,
    country: orgRest.country === 'NZ' ? ('NZ' as const) : ('AU' as const),
    setupStartedAt: (setupStartedAt as Date | null)?.toISOString() ?? null,
    setupCompletedAt: (setupCompletedAt as Date | null)?.toISOString() ?? null,
  };

  return <SetupShell initial={initial} />;
}
