// GET /api/margot/health — RA-1658
// Proxies Hermes /healthz and returns Margot online state.
// Gracefully degrades when HERMES_BASE_URL is not configured.
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  verifyAdminFromDb,
  verifyPlatformSupportOperator,
} from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;
  // Platform-owned surface: tenant ADMIN is every self-registered owner.
  const operator = verifyPlatformSupportOperator(auth);
  if (operator.response) return operator.response;

  const fetchedAt = new Date().toISOString();
  const hermesBase = (process.env.HERMES_BASE_URL ?? "").replace(/\/$/, "");

  if (!hermesBase) {
    return Response.json({
      data: {
        online: false,
        lastHeartbeat: null,
        stale: true,
        reason: "HERMES_BASE_URL not configured",
      },
      fetchedAt,
      stale: true,
    });
  }

  try {
    const res = await fetch(`${hermesBase}/healthz`, {
      signal: AbortSignal.timeout(5_000),
      // A followed redirect would let the target (a login page, say) answer
      // for Hermes. A 3xx is not ok, so it fails closed below.
      redirect: "manual",
    });
    // A configured-but-failing URL is not a reachable Hermes. Fail closed before
    // reading the body, so a 5xx payload can never supply uptime or version.
    if (!res.ok) {
      return Response.json({
        data: {
          online: false,
          lastHeartbeat: null,
          stale: true,
          reason: `Hermes returned HTTP ${res.status}`,
        },
        fetchedAt,
        stale: true,
      });
    }
    // A 200 that is not a JSON object (an auth proxy or captive page in front
    // of a dead Hermes) does not confirm Hermes is up.
    const body: unknown = await res.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({
        data: {
          online: false,
          lastHeartbeat: null,
          stale: true,
          reason: "Hermes health response was not a JSON object",
        },
        fetchedAt,
        stale: true,
      });
    }
    const health = body as Record<string, unknown>;
    return Response.json({
      data: {
        online: true,
        lastHeartbeat: fetchedAt,
        uptime: health.uptime ?? null,
        version: health.version ?? null,
        stale: false,
      },
      fetchedAt,
      stale: false,
    });
  } catch {
    return Response.json({
      data: {
        online: false,
        lastHeartbeat: null,
        stale: true,
        reason: "Hermes unreachable",
      },
      fetchedAt,
      stale: true,
    });
  }
}
