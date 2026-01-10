import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // Verify authorization header
  const authHeader = request.headers.get('authorization');
  const expectedSecret = process.env.CRON_SECRET || process.env.MIGRATION_SECRET;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.substring(7);
  if (token !== expectedSecret) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  try {
    // Import Prisma
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    // Test connection
    await prisma.$executeRawUnsafe('SELECT 1');

    // Run migrations
    const { execSync } = await import('child_process');
    const output = execSync('npx prisma migrate deploy', {
      encoding: 'utf-8',
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL,
        DIRECT_URL: process.env.DIRECT_URL,
      }
    });

    await prisma.$disconnect();

    return NextResponse.json({
      success: true,
      message: 'Migrations completed successfully',
      output
    });
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json(
      {
        error: 'Migration failed',
        message: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
