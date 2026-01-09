import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const scheduledEmail = await prisma.scheduledEmail.findFirst({
      where: {
        id,
        userId: session.user.id,
        status: 'pending',
      },
    });

    if (!scheduledEmail) {
      return NextResponse.json(
        { error: 'Scheduled email not found' },
        { status: 404 }
      );
    }

    const updated = await prisma.scheduledEmail.update({
      where: { id },
      data: { status: 'cancelled' },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error cancelling scheduled email:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
