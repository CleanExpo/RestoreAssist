import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const org = await prisma.organization.findFirst({
    where: { ownerId: session.user.id },
    select: {
      id: true,
      legalName: true,
      tradingName: true,
      abn: true,
      acn: true,
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
      setupMode: true,
      pricingConfig: true,
      hydrationJobs: {
        select: { kind: true, status: true, errorMessage: true, completedAt: true },
      },
    },
  });

  if (!org) {
    return NextResponse.json({ error: 'No organization for this user' }, { status: 404 });
  }

  // Derive per-section status from hydration jobs (default PENDING if no job row)
  const jobByKind = Object.fromEntries(org.hydrationJobs.map((j) => [j.kind, j.status]));

  return NextResponse.json({
    data: {
      organization: org,
      sections: {
        businessDetails: jobByKind.ABR ?? 'PENDING',
        branding:        jobByKind.WEBSITE ?? 'PENDING',
        pricing:         jobByKind.PRICING ?? 'PENDING',
      },
    },
  });
}
