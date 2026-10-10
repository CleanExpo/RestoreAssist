/**
 * GET /api/mission-control/workers — read-only worker health projection.
 *
 * Implements ADR 2026-09-08 Mission Control boundaries, D3 and D4: worker
 * health is pull-based from env-configured URLs, polled with a bounded
 * timeout, and fails closed to an offline state with a reason. There is no
 * write path, no SSH, and no URL is ever taken from the request.
 *
 * Configuration: MISSION_CONTROL_WORKERS is a comma-separated list of
 * `name=https://host` pairs. Each is probed at `<base>/healthz`.
 */
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  verifyAdminFromDb,
  verifyPlatformSupportOperator,
} from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const PROBE_TIMEOUT_MS = 5_000;

type Worker = {
  name: string;
  url: string | null;
  online: boolean;
  lastHeartbeat: string | null;
  stale: boolean;
  reason?: string;
  uptime?: unknown;
  version?: unknown;
};

function parseWorkers(raw: string): { name: string; url: string | null }[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const separator = entry.indexOf("=");
      const name =
        separator === -1 ? entry : entry.slice(0, separator).trim();
      const value = separator === -1 ? "" : entry.slice(separator + 1).trim();
      let url: string | null = null;
      try {
        const parsed = new URL(value);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          url = value.replace(/\/$/, "");
        }
      } catch {
        url = null;
      }
      return { name: name || "unnamed", url };
    });
}

async function probe(
  worker: { name: string; url: string | null },
  fetchedAt: string,
): Promise<Worker> {
  if (!worker.url) {
    return {
      name: worker.name,
      url: null,
      online: false,
      lastHeartbeat: null,
      stale: true,
      reason: "Worker URL is not a valid http or https URL",
    };
  }
  try {
    const res = await fetch(`${worker.url}/healthz`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    // A configured-but-failing URL is not a reachable worker. Fail closed
    // before reading the body, so an error payload cannot supply facts.
    if (!res.ok) {
      return {
        name: worker.name,
        url: worker.url,
        online: false,
        lastHeartbeat: null,
        stale: true,
        reason: `Worker returned HTTP ${res.status}`,
      };
    }
    const body = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    return {
      name: worker.name,
      url: worker.url,
      online: true,
      lastHeartbeat: fetchedAt,
      stale: false,
      uptime: body.uptime ?? null,
      version: body.version ?? null,
    };
  } catch {
    // The upstream message is deliberately not echoed: it can carry internal
    // hostnames and addresses.
    return {
      name: worker.name,
      url: worker.url,
      online: false,
      lastHeartbeat: null,
      stale: true,
      reason: "Worker unreachable",
    };
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;
  // Platform-owned surface: tenant ADMIN is every self-registered owner.
  const operator = verifyPlatformSupportOperator(auth);
  if (operator.response) return operator.response;

  const fetchedAt = new Date().toISOString();
  const configured = parseWorkers(process.env.MISSION_CONTROL_WORKERS ?? "");

  if (configured.length === 0) {
    return Response.json({
      data: { workers: [] },
      fetchedAt,
      stale: true,
      reason: "MISSION_CONTROL_WORKERS not configured",
    });
  }

  const workers = await Promise.all(
    configured.map((worker) => probe(worker, fetchedAt)),
  );

  const degraded = workers.filter((worker) => worker.stale);
  if (degraded.length > 0) {
    return Response.json({
      data: { workers },
      fetchedAt,
      stale: true,
      reason: `${degraded.length} of ${workers.length} workers could not be confirmed online`,
    });
  }

  return Response.json({ data: { workers }, fetchedAt, stale: false });
}
