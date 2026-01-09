import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const scheduleEmailSchema = z.object({
  reportId: z.string().min(1),
  recipient: z.string().email(),
  scheduledAt: z.string().datetime(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = scheduleEmailSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.errors },
        { status: 400 }
      );
    }

    const { reportId, recipient, scheduledAt } = validation.data;

    const report = await prisma.report.findFirst({
      where: {
        id: reportId,
        userId: session.user.id,
      },
    });

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    const scheduledDate = new Date(scheduledAt);
    if (scheduledDate <= new Date()) {
      return NextResponse.json(
        { error: 'Scheduled time must be in the future' },
        { status: 400 }
      );
    }

    const scheduledEmail = await prisma.scheduledEmail.create({
      data: {
        userId: session.user.id,
        reportId,
        recipient,
        scheduledAt: scheduledDate,
        status: 'pending',
      },
    });

    return NextResponse.json(scheduledEmail);
  } catch (error) {
    console.error('Error scheduling email:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {
      userId: session.user.id,
    };

    if (status) {
      where.status = status;
    }

    const scheduledEmails = await prisma.scheduledEmail.findMany({
      where,
      include: {
        report: {
          select: {
            id: true,
            title: true,
            clientName: true,
            propertyAddress: true,
          },
        },
      },
      orderBy: {
        scheduledAt: 'asc',
      },
    });

    return NextResponse.json(scheduledEmails);
  } catch (error) {
    console.error('Error fetching scheduled emails:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
