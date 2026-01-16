import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, organizationId: true }
  })

  if (!user?.organizationId) {
    return NextResponse.json({ assignees: [] })
  }

  // For Technicians: Return all Managers in the organization
  if (user.role === "USER") {
    const managers = await prisma.user.findMany({
      where: {
        organizationId: user.organizationId,
        role: "MANAGER"
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: { name: "asc" }
    })
    return NextResponse.json({ assignees: managers })
  }

  // For Managers: Return all Admins in the organization
  if (user.role === "MANAGER") {
    const admins = await prisma.user.findMany({
      where: {
        organizationId: user.organizationId,
        role: "ADMIN"
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: { name: "asc" }
    })
    return NextResponse.json({ assignees: admins })
  }

  // For Admins: Return empty (they don't need to assign)
  return NextResponse.json({ assignees: [] })
}
