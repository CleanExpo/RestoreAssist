import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDigitalOceanAccount } from '@/lib/digitalocean'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const account = await getDigitalOceanAccount()

    return NextResponse.json({
      account: {
        uuid: account?.uuid,
        email: account?.email,
        email_verified: account?.email_verified,
        status: account?.status,
        status_message: account?.status_message,
        droplet_limit: account?.droplet_limit,
        floating_ip_limit: account?.floating_ip_limit,
      },
    })
  } catch (error) {
    console.error('[DigitalOcean] Account lookup failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch account' },
      { status: 500 }
    )
  }
}

