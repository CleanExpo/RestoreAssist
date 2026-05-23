// TODO: Replace 1s polling with Postgres NOTIFY/LISTEN for lower overhead
// when job volume grows beyond a few concurrent setups.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const org = await prisma.organization.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true },
  });
  if (!org) {
    return NextResponse.json({ error: 'No organization for this user' }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const orgId = org.id;

  const stream = new ReadableStream({
    async start(controller) {
      let lastSnapshot = '';
      const maxIterations = 120; // 2-minute safety cap at 1-second tick
      try {
        for (let i = 0; i < maxIterations; i++) {
          const jobs = await prisma.hydrationJob.findMany({
            where: { organizationId: orgId },
            select: { kind: true, status: true, payload: true, errorMessage: true },
          });
          const snapshot = JSON.stringify(jobs);
          if (snapshot !== lastSnapshot) {
            controller.enqueue(encoder.encode(`data: ${snapshot}\n\n`));
            lastSnapshot = snapshot;
          }
          const allTerminal =
            jobs.length === 3 &&
            jobs.every(
              (j) => j.status === 'READY' || j.status === 'ERROR' || j.status === 'MANUAL',
            );
          if (allTerminal) break;
          await new Promise((r) => setTimeout(r, 1000));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // disable nginx buffering if behind a reverse proxy
    },
  });
}
