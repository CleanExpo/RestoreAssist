// GET /api/margot/schedules — RA-1658
// Reads scheduled briefings from margot_schedules Supabase table.
// Falls back to a static list when the table is not yet created.
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const STATIC_SCHEDULES = [
  { id: "morning_brief",  name: "Morning Brief",    cronExpr: "0 8 * * 1-5",  nextRunAt: null, lastStatus: null },
  { id: "eod_wrap",       name: "EOD Wrap",          cronExpr: "30 17 * * 1-5", nextRunAt: null, lastStatus: null },
  { id: "week_ahead",     name: "Week Ahead (Mon)",  cronExpr: "0 7 * * 1",    nextRunAt: null, lastStatus: null },
];

export async function GET() {
  const session = await getServerSession(authOptions);
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;

  const fetchedAt = new Date().toISOString();

  try {
    const sb = getSupabaseServerClient();
    const { data, error } = await sb
      .from("margot_schedules")
      .select("id, name, cron_expr, next_run_at, last_status")
      .order("next_run_at", { ascending: true, nullsFirst: false })
      .limit(10);

    if (error) {
      return Response.json({ data: { schedules: STATIC_SCHEDULES }, fetchedAt, stale: true, reason: "Using static schedule list" });
    }

    const schedules = (data ?? []).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      cronExpr: row.cron_expr as string,
      nextRunAt: row.next_run_at as string | null,
      lastStatus: row.last_status as string | null,
    }));

    return Response.json({ data: { schedules: schedules.length ? schedules : STATIC_SCHEDULES }, fetchedAt, stale: false });
  } catch {
    return Response.json({ data: { schedules: STATIC_SCHEDULES }, fetchedAt, stale: true, reason: "Schedules table unreachable" });
  }
}
