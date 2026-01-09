import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { EmailService, RateLimiter } from '@/lib/email';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const emailService = new EmailService();
    const rateLimiter = new RateLimiter();

    const connection = await emailService.getConnection(session.user.id);
    const rateLimit = await rateLimiter.getStatus(session.user.id);

    return NextResponse.json({
      connected: connection !== null,
      provider: connection?.provider || null,
      email: connection?.email || null,
      rateLimit: {
        remaining: rateLimit.remaining,
        resetAt: rateLimit.resetAt,
      },
    });
  } catch (error) {
    console.error('Error fetching email status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
