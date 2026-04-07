/**
 * Property Lookup History API
 * GET /api/property/lookup — returns lookup history + cache stats for the current user
 * DELETE /api/property/lookup — clears expired cache entries for the current user
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch PropertyLookup records linked to the user's inspections
    const lookups = await prisma.propertyLookup.findMany({
      where: {
        inspection: { userId: session.user.id },
      },
      orderBy: { lookupDate: "desc" },
      take: 50,
      select: {
        id: true,
        propertyAddress: true,
        propertyPostcode: true,
        lookupDate: true,
        expiresAt: true,
        apiResponseStatus: true,
        dataSource: true,
        confidence: true,
        inspectionId: true,
      },
    });

    const now = new Date();
    const total = lookups.length;
    const successful = lookups.filter(
      (l) => l.apiResponseStatus === 200,
    ).length;
    const cached = lookups.filter((l) => l.expiresAt > now).length;
    const expired = total - cached;

    return NextResponse.json({
      lookups,
      stats: { total, successful, failed: total - successful, cached, expired },
    });
  } catch (error) {
    console.error("Error fetching property lookup history:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Delete expired PropertyLookup entries linked to this user
    const now = new Date();
    const deleted = await prisma.propertyLookup.deleteMany({
      where: {
        inspection: { userId: session.user.id },
        expiresAt: { lt: now },
      },
    });

    return NextResponse.json({ deleted: deleted.count });
  } catch (error) {
    console.error("Error clearing property lookup cache:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
