import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { execSync } from 'child_process'

/**
 * ADMIN ENDPOINT: Manually deploy pending Prisma migrations
 * This is a temporary diagnostic and recovery endpoint
 *
 * POST /api/admin/deploy-migrations?token=SECRET
 */
export async function POST(request: NextRequest) {
  try {
    // Require admin auth token via query parameter
    const token = request.nextUrl.searchParams.get('token')
    const adminSecret = process.env.ADMIN_MIGRATION_SECRET || 'temp-migration-key'

    if (token !== adminSecret) {
      return NextResponse.json(
        { error: 'Unauthorized. Invalid or missing admin token.' },
        { status: 401 }
      )
    }

    console.log('🔄 Attempting to deploy pending migrations...')

    // Run prisma migrate deploy
    try {
      const output = execSync('npx prisma migrate deploy', {
        encoding: 'utf-8',
        stdio: 'pipe'
      })

      console.log('✅ Migrations deployed successfully')
      console.log('Output:', output)

      return NextResponse.json({
        status: 'success',
        message: 'Pending migrations deployed successfully',
        output: output
      })
    } catch (error: any) {
      console.error('❌ Migration deployment failed:', error.message)

      // If no pending migrations, that's also a success
      if (error.message.includes('Up to date')) {
        return NextResponse.json({
          status: 'success',
          message: 'All migrations already applied - database is up to date',
          output: error.message
        })
      }

      return NextResponse.json({
        status: 'error',
        message: 'Failed to deploy migrations',
        error: error.message,
        stderr: error.stderr?.toString(),
        stdout: error.stdout?.toString()
      }, { status: 500 })
    }
  } catch (error: any) {
    console.error('Unexpected error:', error)
    return NextResponse.json({
      status: 'error',
      message: 'Unexpected error',
      error: error.message
    }, { status: 500 })
  }
}

/**
 * GET /api/admin/deploy-migrations?token=SECRET
 * Check migration status
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')
    const adminSecret = process.env.ADMIN_MIGRATION_SECRET || 'temp-migration-key'

    if (token !== adminSecret) {
      return NextResponse.json(
        { error: 'Unauthorized. Invalid or missing admin token.' },
        { status: 401 }
      )
    }

    console.log('🔍 Checking migration status...')

    try {
      const output = execSync('npx prisma migrate status', {
        encoding: 'utf-8',
        stdio: 'pipe'
      })

      return NextResponse.json({
        status: 'success',
        migrations: output
      })
    } catch (error: any) {
      // prisma migrate status returns exit code 1 if there are pending migrations
      return NextResponse.json({
        status: 'pending_migrations',
        message: 'Pending migrations found',
        details: error.message
      })
    }
  } catch (error: any) {
    console.error('Error checking migration status:', error)
    return NextResponse.json({
      status: 'error',
      message: 'Failed to check migration status',
      error: error.message
    }, { status: 500 })
  }
}
