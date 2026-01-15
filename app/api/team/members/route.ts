import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

function canViewTeam(role?: string) {
  return role === "ADMIN" || role === "MANAGER"
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!canViewTeam(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { organizationId: true }
  })

  if (!user?.organizationId) {
    // Backward compatible: no org yet means "team" is just the current account.
    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, email: true, role: true, managedById: true, createdAt: true }
    })
    return NextResponse.json({ members: me ? [me] : [] })
  }

  const members = await prisma.user.findMany({
    where: { organizationId: user.organizationId },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      managedById: true,
      createdAt: true
    }
  })

  return NextResponse.json({ members })
}

