/**
 * GET /api/video/analytics
 * Admin-only endpoint. Returns video engagement analytics.
 *
 * Query params:
 *   period: "7d" | "30d" | "90d" (default: 30d)
 *   slug: optional filter by video slug
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fromException } from "@/lib/api-errors";
import { createClient } from "@supabase/supabase-js";

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase public env is not configured");
  }

  return createClient(url, key);
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseClient();

    // Check admin/policy role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .in("role", ["ADMIN", "OWNER", "POLICY"])
      .maybeSingle();

    if (!roleData) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") || "30d";
    const slug = searchParams.get("slug");

    const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;

    // Build query
    let query = supabase
      .from("video_engagement")
      .select("video_slug, event_type, user_id, event_at")
      .gte("event_at", new Date(Date.now() - days * 86400000).toISOString());

    if (slug) {
      query = query.eq("video_slug", slug);
    }

    const { data: events, error } = await query;

    if (error) {
      return fromException(req, error, { stage: "video/analytics:query" });
    }

    // Aggregate
    const slugStats: Record<
      string,
      {
        plays: number;
        pauses: number;
        completes: number;
        p25: number;
        p50: number;
        p75: number;
        uniqueUsers: Set<string>;
      }
    > = {};

    for (const ev of events || []) {
      if (!slugStats[ev.video_slug]) {
        slugStats[ev.video_slug] = {
          plays: 0,
          pauses: 0,
          completes: 0,
          p25: 0,
          p50: 0,
          p75: 0,
          uniqueUsers: new Set(),
        };
      }
      const s = slugStats[ev.video_slug];
      s.uniqueUsers.add(ev.user_id);
      switch (ev.event_type) {
        case "play":
          s.plays++;
          break;
        case "pause":
          s.pauses++;
          break;
        case "complete":
          s.completes++;
          break;
        case "progress_25":
          s.p25++;
          break;
        case "progress_50":
          s.p50++;
          break;
        case "progress_75":
          s.p75++;
          break;
      }
    }

    const result = Object.entries(slugStats).map(([videoSlug, stats]) => ({
      videoSlug,
      plays: stats.plays,
      pauses: stats.pauses,
      completes: stats.completes,
      p25: stats.p25,
      p50: stats.p50,
      p75: stats.p75,
      uniqueUsers: stats.uniqueUsers.size,
      completionRate:
        stats.plays > 0 ? Math.round((stats.completes / stats.plays) * 100) : 0,
      dropoff25:
        stats.plays > 0
          ? Math.round(((stats.plays - stats.p25) / stats.plays) * 100)
          : 0,
      dropoff50:
        stats.p25 > 0
          ? Math.round(((stats.p25 - stats.p50) / stats.p25) * 100)
          : 0,
    }));

    result.sort((a, b) => b.plays - a.plays);

    return NextResponse.json({
      period,
      totalVideos: result.length,
      totalEvents: events?.length || 0,
      data: result,
    });
  } catch (err) {
    return fromException(req, err, { stage: "video/analytics" });
  }
}
