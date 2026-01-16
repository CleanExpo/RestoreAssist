import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

function canViewTeam(role?: string) {
  // All authenticated users (ADMIN, MANAGER, USER/Technician) can view their team hierarchy
  return role === "ADMIN" || role === "MANAGER" || role === "USER"
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!canViewTeam(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { organizationId: true, role: true }
  })

  if (!currentUser?.organizationId) {
    // Backward compatible: no org yet means "team" is just the current account.
    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, email: true, role: true, managedById: true, createdAt: true }
    })
    return NextResponse.json({ members: me ? [me] : [] })
  }

  // Build where clause based on user role
  let whereClause: any = { organizationId: currentUser.organizationId }
  
  // Managers can see all Technicians in the organization (for analytics filtering)
  // Note: For team management page, they can only manage their own Technicians
  // But for analytics, they can view all Technicians' analytics
  if (currentUser.role === "MANAGER") {
    whereClause = {
      organizationId: currentUser.organizationId,
      role: "USER" // Only Technicians (all Technicians in the organization)
    }
  }
  // Admins see all members (Managers and Technicians)
  // Technicians see all members (for hierarchy view)

  const members = await prisma.user.findMany({
    where: whereClause,
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

