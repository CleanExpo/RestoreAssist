import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { SetupShell } from '@/components/setup/SetupShell';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect('/login');
  }

  const org = await prisma.organization.findFirst({
    where: { ownerId: session.user.id },
    select: {
      id: true, legalName: true, tradingName: true, abn: true, acn: true,
      state: true, address: true, phone: true, email: true, website: true,
      logoUrl: true, primaryColor: true, accentColor: true, aboutCopy: true,
      tradingStatus: true, setupStartedAt: true, setupCompletedAt: true,
      hydrationJobs: { select: { kind: true, status: true } },
    },
  });

  if (!org) {
    redirect('/');
  }
  if (org.setupCompletedAt) {
    redirect('/dashboard');
  }

  // Convert Date fields to ISO strings for client component serialization
  // Capture before TypeScript narrows to never after the redirect guard above
  const { setupStartedAt, setupCompletedAt, ...orgRest } = org;
  const initial = {
    ...orgRest,
    setupStartedAt: (setupStartedAt as Date | null)?.toISOString() ?? null,
    setupCompletedAt: (setupCompletedAt as Date | null)?.toISOString() ?? null,
  };

  return <SetupShell initial={initial} />;
}
