import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import crypto from "crypto"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

function canInvite(role?: string) {
  return role === "ADMIN" || role === "MANAGER"
}

async function ensureOrganizationForUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error("User not found")

  if (user.organizationId) return user.organizationId

  // Backward compatible: if an existing user has no org, create one lazily and attach.
  const org = await prisma.organization.create({
    data: {
      name: `${user.name || "Account"} Organisation`,
      ownerId: userId
    }
  })

  await prisma.user.update({
    where: { id: userId },
    data: { organizationId: org.id }
  })

  return org.id
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!canInvite(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const orgId = await ensureOrganizationForUser(session.user.id)

  const invites = await prisma.userInvite.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      role: true,
      token: true,
      expiresAt: true,
      usedAt: true,
      createdAt: true,
      createdById: true,
      managedById: true
    }
  })

  return NextResponse.json({ invites })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!canInvite(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { email, role } = await req.json()
  if (!email || !role) return NextResponse.json({ error: "Email and role are required" }, { status: 400 })

  if (role !== "MANAGER" && role !== "USER") {
    return NextResponse.json({ error: "Invalid role. Use MANAGER or USER." }, { status: 400 })
  }

  // Managers can only invite technicians (USER)
  if (session.user.role === "MANAGER" && role !== "USER") {
    return NextResponse.json({ error: "Managers can only invite technicians" }, { status: 403 })
  }

  const orgId = await ensureOrganizationForUser(session.user.id)

  const token = crypto.randomBytes(24).toString("hex")
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  const invite = await prisma.userInvite.create({
    data: {
      token,
      email,
      role,
      organizationId: orgId,
      createdById: session.user.id,
      managedById: session.user.role === "MANAGER" ? session.user.id : null,
      expiresAt
    }
  })

  return NextResponse.json({ invite })
}

