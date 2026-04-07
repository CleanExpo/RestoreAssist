/**
 * Insurer Profile — single resource
 *
 * GET    /api/insurer-profiles/:id  — get one profile
 * PATCH  /api/insurer-profiles/:id  — update (admin only)
 * DELETE /api/insurer-profiles/:id  — soft-delete (admin only, custom profiles only)
 *
 * RA-406: Sprint H — per-insurer evidence and reporting requirements
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const profile = await prisma.insurerProfile.findUnique({ where: { id } });
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    return NextResponse.json({ data: profile });
  } catch (error) {
    console.error("Error fetching insurer profile:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ─── PATCH ───────────────────────────────────────────────────────────────────

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });
    if (user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    // Strip immutable fields
    const {
      id: _id,
      createdAt: _c,
      isSystemProfile: _s,
      slug: _slug,
      ...updates
    } = body;

    const profile = await prisma.insurerProfile.update({
      where: { id },
      data: updates,
    });

    return NextResponse.json({ data: profile });
  } catch (error: any) {
    console.error("Error updating insurer profile:", error);
    if (error.code === "P2025") {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ─── DELETE ──────────────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });
    if (user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    const profile = await prisma.insurerProfile.findUnique({ where: { id } });
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    if (profile.isSystemProfile) {
      return NextResponse.json(
        {
          error:
            "System profiles cannot be deleted. Deactivate them instead by setting isActive=false.",
        },
        { status: 409 },
      );
    }

    await prisma.insurerProfile.delete({ where: { id } });
    return NextResponse.json({ data: { id } });
  } catch (error) {
    console.error("Error deleting insurer profile:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
