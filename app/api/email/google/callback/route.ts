import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { GoogleGmailService } from '@/lib/email';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(
        new URL(`/dashboard/settings?email_error=${error}`, request.url)
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL('/dashboard/settings?email_error=no_code', request.url)
      );
    }

    const googleService = new GoogleGmailService();
    const tokens = await googleService.getTokensFromCode(code);
    const userEmail = await googleService.getUserEmail(tokens.accessToken);

    await prisma.emailConnection.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        provider: 'google',
        email: userEmail,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      },
      update: {
        provider: 'google',
        email: userEmail,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      },
    });

    return NextResponse.redirect(
      new URL('/dashboard/settings?email_connected=true', request.url)
    );
  } catch (error) {
    console.error('Error in Google callback:', error);
    return NextResponse.redirect(
      new URL('/dashboard/settings?email_error=callback_failed', request.url)
    );
  }
}
