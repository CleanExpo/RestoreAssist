/**
 * GET /api/content/analytics/[postId]
 *
 * Stage 5 of the content automation pipeline (RA-158).
 * Returns all ContentAnalytics records for a ContentPost, most recent first,
 * plus aggregate totals.
 *
 * Authentication: session required — verifies post ownership via post→job→user
 *
 * Response 200:
 *   {
 *     postId:        string
 *     platform:      string
 *     postUrl:       string | null
 *     status:        string
 *     totalViews:    number
 *     totalLikes:    number
 *     totalShares:   number
 *     totalComments: number
 *     totalReach:    number
 *     analytics:     ContentAnalytics[]
 *   }
 *
 * Response 401: not authenticated
 * Response 404: post not found or not owned by user
 * Response 500: database error
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ postId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { postId } = await context.params;

  if (!postId) {
    return NextResponse.json({ error: "postId is required" }, { status: 400 });
  }

  try {
    // Verify post exists and belongs to the requesting user (via job)
    const post = await prisma.contentPost.findFirst({
      where: {
        id: postId,
        job: {
          userId: session.user.id,
        },
      },
      include: {
        analytics: {
          orderBy: { recordedAt: "desc" },
        },
      },
    });

    if (!post) {
      return NextResponse.json(
        { error: "ContentPost not found or not owned by user" },
        { status: 404 },
      );
    }

    // Compute aggregate totals across all analytics snapshots
    const totals = post.analytics.reduce(
      (acc, record) => ({
        totalViews: acc.totalViews + record.views,
        totalLikes: acc.totalLikes + record.likes,
        totalShares: acc.totalShares + record.shares,
        totalComments: acc.totalComments + record.comments,
        totalReach: Math.max(acc.totalReach, record.reach), // reach is cumulative peak
      }),
      {
        totalViews: 0,
        totalLikes: 0,
        totalShares: 0,
        totalComments: 0,
        totalReach: 0,
      },
    );

    return NextResponse.json(
      {
        postId: post.id,
        platform: post.platform,
        postUrl: post.postUrl,
        status: post.status,
        scheduledAt: post.scheduledAt,
        postedAt: post.postedAt,
        ...totals,
        analytics: post.analytics,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[analytics] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
