import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sanitizeString } from "@/lib/sanitize"

/**
 * H3 — Multi-Tenancy Authorization Fix
 *
 * Access rules for a BusinessProfile:
 *   1. The profile's owning user (profile.userId === session.user.id), OR
 *   2. A member of the same Organization as the profile
 *      (profile.organizationId && profile.organizationId === session.user.organizationId)
 *
 * This prevents team members from reaching profiles outside their own org scope
 * and closes the gap where only userId was checked.
 */

// ---------------------------------------------------------------------------
// Helper: resolve the profile and enforce authorization
// ---------------------------------------------------------------------------
async function resolveAuthorizedProfile(
  profileId: string,
  sessionUserId: string,
  sessionOrgId: string | null | undefined
) {
  const profile = await prisma.businessProfile.findUnique({
    where: { id: profileId },
  })

  if (!profile) return { profile: null, authorized: false }

  // Rule 1: direct ownership
  const isOwner = profile.userId === sessionUserId

  // Rule 2: same-organization member access
  const isOrgMember =
    !!profile.organizationId &&
    !!sessionOrgId &&
    profile.organizationId === sessionOrgId

  return { profile, authorized: isOwner || isOrgMember }
}

// ---------------------------------------------------------------------------
// GET /api/business-profiles/[id]
// ---------------------------------------------------------------------------
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const { profile, authorized } = await resolveAuthorizedProfile(
      id,
      session.user.id,
      session.user.organizationId
    )

    if (!profile) {
      return NextResponse.json({ error: "Business profile not found" }, { status: 404 })
    }

    if (!authorized) {
      // Return 404 rather than 403 to avoid leaking existence to unauthorized callers
      return NextResponse.json({ error: "Business profile not found" }, { status: 404 })
    }

    return NextResponse.json(profile)
  } catch (error) {
    console.error("[BusinessProfile GET] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// PUT /api/business-profiles/[id]
// ---------------------------------------------------------------------------
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const { profile, authorized } = await resolveAuthorizedProfile(
      id,
      session.user.id,
      session.user.organizationId
    )

    if (!profile) {
      return NextResponse.json({ error: "Business profile not found" }, { status: 404 })
    }

    if (!authorized) {
      return NextResponse.json({ error: "Business profile not found" }, { status: 404 })
    }

    // Only the direct owner may mutate the profile (org members can read, not write)
    if (profile.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Only the profile owner may update this business profile" },
        { status: 403 }
      )
    }

    const body = await request.json()

    const updated = await prisma.businessProfile.update({
      where: { id },
      data: {
        name: sanitizeString(body.name, 200),
        abn: sanitizeString(body.abn, 20) || null,
        phone: sanitizeString(body.phone, 50) || null,
        email: sanitizeString(body.email, 320) || null,
        address: sanitizeString(body.address, 500) || null,
        logo: sanitizeString(body.logo, 1000) || null,
        isDefault: typeof body.isDefault === "boolean" ? body.isDefault : undefined,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("[BusinessProfile PUT] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/business-profiles/[id]
// ---------------------------------------------------------------------------
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const { profile, authorized } = await resolveAuthorizedProfile(
      id,
      session.user.id,
      session.user.organizationId
    )

    if (!profile) {
      return NextResponse.json({ error: "Business profile not found" }, { status: 404 })
    }

    if (!authorized) {
      return NextResponse.json({ error: "Business profile not found" }, { status: 404 })
    }

    // Only the direct owner may delete their own profile
    if (profile.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Only the profile owner may delete this business profile" },
        { status: 403 }
      )
    }

    if (profile.isDefault) {
      return NextResponse.json(
        { error: "Cannot delete the default business profile" },
        { status: 400 }
      )
    }

    await prisma.businessProfile.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[BusinessProfile DELETE] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
