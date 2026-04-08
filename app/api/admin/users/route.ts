import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { verifyAdminFromDb } from '@/lib/admin-auth'

// GET — list users with optional search and role filter
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)

  // Re-validates role from DB to prevent stale JWT role from granting admin access
  const auth = await verifyAdminFromDb(session)
  if (auth.response) return auth.response
  const { user: adminUser } = auth

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')?.trim() ?? ''
  const role = searchParams.get('role')?.toUpperCase() ?? ''

  // Scope to the admin's own organization — prevents cross-tenant user enumeration
  const where: any = {
    organizationId: adminUser!.organizationId,
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ]
  }

  if (role && ['ADMIN', 'MANAGER', 'USER'].includes(role)) {
    where.role = role as 'ADMIN' | 'MANAGER' | 'USER'
  }

  // Paginate to prevent full-table scan (F10)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50')))

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      take: limit,
      skip: (page - 1) * limit,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        organizationId: true,
        subscriptionStatus: true,
        _count: {
          select: {
            inspections: true,
            reports: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where }),
  ])

  return NextResponse.json({ users, total, page, limit })
}
