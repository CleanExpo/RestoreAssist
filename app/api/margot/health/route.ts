// GET /api/margot/health — RA-1658
// Proxies Hermes /healthz and returns Margot online state.
// Gracefully degrades when HERMES_BASE_URL is not configured.
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const HERMES_BASE = (process.env.HERMES_BASE_URL ?? "").replace(/\/$/, "");

export async function GET() {
  const session = await getServerSession(authOptions);
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;

  const fetchedAt = new Date().toISOString();

  if (!HERMES_BASE) {
    return Response.json({
      data: { online: false, lastHeartbeat: null, stale: true, reason: "HERMES_BASE_URL not configured" },
      fetchedAt,
      stale: true,
    });
  }

  try {
    const res = await fetch(`${HERMES_BASE}/healthz`, {
      signal: AbortSignal.timeout(5_000),
    });
    const body = await res.json().catch(() => ({}));
    return Response.json({
      data: {
        online: res.ok,
        lastHeartbeat: fetchedAt,
        uptime: body.uptime ?? null,
        version: body.version ?? null,
        stale: false,
      },
      fetchedAt,
      stale: false,
    });
  } catch {
    return Response.json({
      data: { online: false, lastHeartbeat: null, stale: true, reason: "Hermes unreachable" },
      fetchedAt,
      stale: true,
    });
  }
}
