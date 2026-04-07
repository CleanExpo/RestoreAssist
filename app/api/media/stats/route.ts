/**
 * RA-419: Media Library Stats API
 * GET /api/media/stats — workspace-level asset statistics
 *
 * Returns:
 *   total           — total asset count
 *   byDamageType    — { label, count }[] sorted by count desc
 *   byMonth         — { month: "YYYY-MM", count }[] last 12 months
 *   topLocations    — { postcode, count }[] top 10
 *   storageBytes    — total fileSize sum
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkPaymentGate } from "@/lib/workspace/payment-gate";

export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // RA-426: Workspace payment gate
    const gate = await checkPaymentGate(session.user.id);
    if (!gate.allowed) return gate.response;

    // Resolve workspaceId
    const member = await prisma.workspaceMember.findFirst({
      where: { userId: session.user.id, status: "ACTIVE" },
      select: { workspaceId: true },
      orderBy: { joinedAt: "asc" },
    });

    if (!member) {
      return NextResponse.json({
        total: 0,
        byDamageType: [],
        byMonth: [],
        topLocations: [],
        storageBytes: 0,
      });
    }

    const workspaceId = member.workspaceId;

    // Run all stats queries in parallel
    const [total, storageAgg, damageTypeTags, locationTags, monthlyAssets] =
      await Promise.all([
        // Total count
        prisma.mediaAsset.count({ where: { workspaceId } }),

        // Total storage
        prisma.mediaAsset.aggregate({
          where: { workspaceId },
          _sum: { fileSize: true },
        }),

        // By damage type — via tags
        prisma.mediaAssetTag.groupBy({
          by: ["value"],
          where: { workspaceId, category: "damage_type" },
          _count: { assetId: true },
          orderBy: { _count: { assetId: "desc" } },
          take: 10,
        }),

        // By location (postcode) — via tags
        prisma.mediaAssetTag.groupBy({
          by: ["value"],
          where: { workspaceId, category: "location" },
          _count: { assetId: true },
          orderBy: { _count: { assetId: "desc" } },
          take: 10,
        }),

        // By month (last 12 months)
        prisma.mediaAssetTag.groupBy({
          by: ["value"],
          where: {
            workspaceId,
            category: "date_bucket",
            value: { gte: getMonthBucketOffset(-12) },
          },
          _count: { assetId: true },
          orderBy: { value: "asc" },
        }),
      ]);

    return NextResponse.json({
      total,
      storageBytes: storageAgg._sum.fileSize ?? 0,
      byDamageType: damageTypeTags.map((t) => ({
        label: t.value,
        count: t._count.assetId,
      })),
      byMonth: monthlyAssets.map((t) => ({
        month: t.value,
        count: t._count.assetId,
      })),
      topLocations: locationTags.map((t) => ({
        postcode: t.value,
        count: t._count.assetId,
      })),
    });
  } catch (error) {
    console.error("[GET /api/media/stats] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getMonthBucketOffset(monthsAgo: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + monthsAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
