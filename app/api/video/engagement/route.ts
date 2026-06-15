/**
 * POST /api/video/engagement
 * Track video playback events from the client.
 *
 * Body: {
 *   videoSlug: string,
 *   eventType: 'play' | 'pause' | 'complete' | 'progress_25' | 'progress_50' | 'progress_75',
 *   watchDurationSec?: number,
 *   totalDurationSec?: number,
 * }
 *
 * Returns: { ok: boolean }
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { fromException } from "@/lib/api-errors";

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase public env is not configured");
  }

  return createClient(url, key);
}

// Simple UA parsing without external dependency
function getDeviceType(ua: string): "desktop" | "mobile" | "tablet" {
  const lower = ua.toLowerCase();
  if (/tablet|ipad/.test(lower)) return "tablet";
  if (/mobile|android|iphone/.test(lower)) return "mobile";
  return "desktop";
}

function getBrowser(ua: string): string | null {
  const match = ua.match(/(Chrome|Firefox|Safari|Edge|Opera)\/[\d.]+/);
  return match ? match[1] : null;
}

const VALID_EVENTS = [
  "play",
  "pause",
  "complete",
  "progress_25",
  "progress_50",
  "progress_75",
];

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const supabase = getSupabaseClient();

    const body = await req.json();
    const { videoSlug, eventType, watchDurationSec, totalDurationSec } = body;

    if (!videoSlug || !VALID_EVENTS.includes(eventType)) {
      return NextResponse.json(
        { ok: false, error: "Invalid videoSlug or eventType" },
        { status: 400 },
      );
    }

    const ua = req.headers.get("user-agent") || "";

    const { error } = await supabase.from("video_engagement").insert({
      user_id: session.user.id,
      org_id: (session.user as any).organizationId || null,
      video_slug: videoSlug,
      event_type: eventType,
      watch_duration_sec: watchDurationSec || 0,
      total_duration_sec: totalDurationSec || null,
      device_type: getDeviceType(ua),
      browser: getBrowser(ua),
      session_id: req.cookies.get("next-auth.session-token")?.value || null,
    });

    if (error) {
      return fromException(req, error, { stage: "video/engagement:insert" });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return fromException(req, err, { stage: "video/engagement" });
  }
}
