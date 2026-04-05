/**
 * RA-417: Media Asset Catalog API
 * GET /api/media — list and filter MediaAssets by cataloging dimensions
 *
 * Query params (all optional, combinable):
 *   job        → inspectionId (exact)
 *   room       → room tag value (exact)
 *   type       → damage_type tag value (exact)
 *   from       → ISO date string — filter by capturedAt >=
 *   to         → ISO date string — filter by capturedAt <=
 *   technician → technician tag value (exact)
 *   device     → device tag value (contains)
 *   location   → postcode (exact)
 *   take       → page size (default 50, max 100)
 *   cursor     → pagination cursor (asset id)
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

    const { searchParams } = request.nextUrl;
    const job = searchParams.get("job");
    const room = searchParams.get("room");
    const type = searchParams.get("type");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const technician = searchParams.get("technician");
    const device = searchParams.get("device");
    const location = searchParams.get("location");
    const cursor = searchParams.get("cursor");
    const take = Math.min(parseInt(searchParams.get("take") ?? "50"), 100);

    // Resolve workspaceId for this user
    const member = await prisma.workspaceMember.findFirst({
      where: { userId: session.user.id, status: "ACTIVE" },
      select: { workspaceId: true },
      orderBy: { joinedAt: "asc" },
    });

    if (!member) {
      // No workspace yet — return empty (user may not have subscribed yet)
      return NextResponse.json({ data: [], nextCursor: null });
    }

    const workspaceId = member.workspaceId;

    // Build tag filters — each tag filter requires the asset to have a matching tag
    const tagFilters: Array<{
      category: string;
      value?: string;
      inspection?: object;
    }> = [];

    if (job) {
      tagFilters.push({ category: "job", inspection: { id: job } });
    }
    if (room) tagFilters.push({ category: "room", value: room });
    if (type) tagFilters.push({ category: "damage_type", value: type });
    if (technician) tagFilters.push({ category: "technician", value: technician });
    if (location) tagFilters.push({ category: "location", value: location });

    // Build where clause
    const where: Record<string, unknown> = {
      workspaceId,
      ...(cursor ? { id: { gt: cursor } } : {}),
      ...(from || to
        ? {
            capturedAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
      ...(device
        ? {
            OR: [
              { deviceMake: { contains: device, mode: "insensitive" } },
              { deviceModel: { contains: device, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(tagFilters.length > 0
        ? {
            tags: {
              some: tagFilters.length === 1
                ? buildTagFilter(tagFilters[0])
                : undefined,
            },
            AND: tagFilters.length > 1
              ? tagFilters.map((f) => ({
                  tags: { some: buildTagFilter(f) },
                }))
              : undefined,
          }
        : {}),
    };

    const assets = await prisma.mediaAsset.findMany({
      where,
      take: take + 1, // fetch one extra to check for next page
      orderBy: [{ capturedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        originalFilename: true,
        mimeType: true,
        fileSize: true,
        storagePath: true,
        latitude: true,
        longitude: true,
        capturedAt: true,
        deviceMake: true,
        deviceModel: true,
        width: true,
        height: true,
        inspectionId: true,
        inspection: {
          select: {
            inspectionNumber: true,
            propertyAddress: true,
            propertyPostcode: true,
          },
        },
        tags: {
          select: { category: true, value: true },
          orderBy: { category: "asc" },
        },
      },
    });

    const hasNextPage = assets.length > take;
    const items = hasNextPage ? assets.slice(0, take) : assets;
    const nextCursor = hasNextPage ? items[items.length - 1].id : null;

    return NextResponse.json({
      data: items,
      nextCursor,
      total: items.length,
    });
  } catch (error) {
    console.error("[GET /api/media] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildTagFilter(f: {
  category: string;
  value?: string;
  inspection?: object;
}) {
  return {
    category: f.category,
    ...(f.value ? { value: f.value } : {}),
    ...(f.inspection ? { inspection: f.inspection } : {}),
  };
}
