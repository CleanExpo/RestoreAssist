import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isValidAbn, normaliseAbn } from '@/lib/abn/checksum';
import { applyRateLimit } from '@/lib/rate-limiter';
import { isPublicHttpUrl } from '@/lib/branding/url-validator';
import { runAbrJob, runWebsiteJob, runPricingJob } from '@/lib/setup/jobs';

const ABN_TAKEN_MESSAGE =
  'This ABN is already registered to another RestoreAssist account. If it is your business, contact support and we will sort it out.';

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

  // SSRF guard: block file://, loopback, RFC1918, link-local before any server-side fetch.
  if (body.website) {
    const check = isPublicHttpUrl(body.website);
    if (!check.ok) {
      return NextResponse.json({ error: 'Invalid website URL' }, { status: 400 });
    }
  }

  const org = await prisma.organization.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true },
  });
  if (!org) {
    return NextResponse.json({ error: 'No organization for this user' }, { status: 404 });
  }

  // J-03 (prelaunch audit): Organization.abn is unique across the platform. The
  // ABN used to be written AFTER the jobs were marked RUNNING, so an ABN another
  // business holds threw P2002 there: the caller got a bare 500 and the jobs
  // stayed RUNNING, leaving the business step spinning. Claim the ABN first and
  // answer 409 with a message the setup card shows as-is.
  const abnTaken = await prisma.organization.findFirst({
    where: { abn, NOT: { id: org.id } },
    select: { id: true },
  });
  if (abnTaken) {
    return NextResponse.json({ error: ABN_TAKEN_MESSAGE }, { status: 409 });
  }
  try {
    // Persist ABN + website + mark setup as started
    await prisma.organization.update({
      where: { id: org.id },
      data: {
        abn,
        website: body.website ?? null,
        setupStartedAt: new Date(),
      },
    });
  } catch (err) {
    // Another business claimed the same ABN between the check and the write.
    if ((err as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ error: ABN_TAKEN_MESSAGE }, { status: 409 });
    }
    throw err;
  }

  // WEBSITE job is RUNNING only when a website was provided; otherwise MANUAL (user-driven).
  const websiteInitialStatus: 'RUNNING' | 'MANUAL' = body.website ? 'RUNNING' : 'MANUAL';
  const initialStatuses = {
    ABR: 'RUNNING' as const,
    WEBSITE: websiteInitialStatus,
    PRICING: 'RUNNING' as const,
  };
  for (const [kind, status] of Object.entries(initialStatuses) as Array<['ABR' | 'WEBSITE' | 'PRICING', 'RUNNING' | 'MANUAL']>) {
    await prisma.hydrationJob.upsert({
      where: { organizationId_kind: { organizationId: org.id, kind } },
      create: { organizationId: org.id, kind, status, completedAt: status === 'MANUAL' ? new Date() : null },
      update: {
        status,
        errorMessage: null,
        startedAt: new Date(),
        completedAt: status === 'MANUAL' ? new Date() : null,
      },
    });
  }

  // Fire-and-forget — each job writes back to HydrationJob + Organization
  void runAbrJob(org.id, abn).catch((err) => console.error('runAbrJob failed:', err));
  if (body.website) {
    void runWebsiteJob(org.id, body.website).catch((err) => console.error('runWebsiteJob failed:', err));
  }
  void runPricingJob(org.id).catch((err) => console.error('runPricingJob failed:', err));

  return NextResponse.json({ data: { accepted: true } }, { status: 202 });
}
