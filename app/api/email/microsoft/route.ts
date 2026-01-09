import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { MicrosoftGraphService } from '@/lib/email';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const microsoftService = new MicrosoftGraphService();
    const authUrl = microsoftService.getAuthUrl();

    return NextResponse.json({ url: authUrl });
  } catch (error) {
    console.error('Error generating Microsoft auth URL:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
