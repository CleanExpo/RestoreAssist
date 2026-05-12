import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isValidAbn, normaliseAbn } from '@/lib/abn/checksum';
import { applyRateLimit } from '@/lib/rate-limiter';
import { runAbrJob, runWebsiteJob, runPricingJob } from '@/lib/setup/jobs';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // TODO(setup-wizard): tighten rate limit key to session.user.id once
  // applyRateLimit supports a custom string key without requiring NextRequest IP.
  const rateLimited = await applyRateLimit(req, {
    maxRequests: 10,
    prefix: 'setup-hydrate',
  });
  if (rateLimited) return rateLimited;

  let body: { abn?: string; website?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const abn = normaliseAbn(body.abn ?? '');
  if (!abn || !isValidAbn(abn)) {
    return NextResponse.json({ error: 'Invalid ABN' }, { status: 400 });
  }

  const org = await prisma.organization.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true },
  });
  if (!org) {
    return NextResponse.json({ error: 'No organization for this user' }, { status: 404 });
  }

  // Upsert 3 jobs into RUNNING state (idempotent on re-submit)
  const kinds = ['ABR', 'WEBSITE', 'PRICING'] as const;
  for (const kind of kinds) {
    await prisma.hydrationJob.upsert({
      where: { organizationId_kind: { organizationId: org.id, kind } },
      create: { organizationId: org.id, kind, status: 'RUNNING' },
      update: { status: 'RUNNING', errorMessage: null, startedAt: new Date(), completedAt: null },
    });
  }

  // Persist ABN + website + mark setup as started
  await prisma.organization.update({
    where: { id: org.id },
    data: {
      abn,
      website: body.website ?? null,
      setupStartedAt: new Date(),
    },
  });

  // Fire-and-forget — each job writes back to HydrationJob + Organization
  void runAbrJob(org.id, abn).catch((err) => console.error('runAbrJob failed:', err));
  if (body.website) {
    void runWebsiteJob(org.id, body.website).catch((err) => console.error('runWebsiteJob failed:', err));
  }
  void runPricingJob(org.id).catch((err) => console.error('runPricingJob failed:', err));

  return NextResponse.json({ data: { accepted: true } }, { status: 202 });
}
