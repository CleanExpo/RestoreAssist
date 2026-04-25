// GET /api/margot/telegram/recent — RA-1658
// Reads last 10 messages from margot_telegram_log Supabase table.
// Degrades gracefully if the table does not exist yet.
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;

  const fetchedAt = new Date().toISOString();

  try {
    const sb = getSupabaseServerClient();
    const { data, error } = await sb
      .from("margot_telegram_log")
      .select("id, from_role, text, sent_at")
      .order("sent_at", { ascending: false })
      .limit(10);

    if (error) {
      return Response.json({
        data: { messages: [] },
        fetchedAt,
        stale: true,
        reason: error.code === "42P01" ? "margot_telegram_log table not yet created" : error.message,
      });
    }

    const messages = (data ?? []).map((row) => ({
      id: row.id as string,
      from: row.from_role as "user" | "assistant",
      text: row.text as string,
      ts: row.sent_at as string,
    }));

    return Response.json({ data: { messages }, fetchedAt, stale: false });
  } catch {
    return Response.json({ data: { messages: [] }, fetchedAt, stale: true, reason: "Telegram log unreachable" });
  }
}
