/**
 * dr-nrpg-liveness.ts — RA-1287 — DR-NRPG integration liveness check.
 *
 * Pings each active DrNrpgIntegration's baseUrl with its stored apiKey and
 * records outcome. Writes lastSyncAt on success. Marks integration inactive
 * after 3 consecutive auth failures.
 *
 * Scope note: the original RA-1287 title referenced "token-refresh cron", but
 * inspection of prisma/schema.prisma:4876 shows DrNrpgIntegration uses a
 * long-lived drNrpgApiKey — there are no short-lived tokens to refresh.
 * The real gap is key-liveness: external rotation/revocation is silent today.
 */
import { prisma } from "@/lib/prisma";
import type { CronJobResult } from "./runner";

const PROBE_TIMEOUT_MS = 10_000;
const MAX_CONSECUTIVE_FAILURES_BEFORE_DEACTIVATE = 3;

export async function runDrNrpgLiveness(): Promise<CronJobResult> {
  const integrations = await (prisma as any).drNrpgIntegration.findMany({
    where: { isActive: true },
  });

  if (integrations.length === 0) {
    return { itemsProcessed: 0, metadata: { reason: "no-active-integrations" } };
  }

  let passed = 0;
  let failed = 0;
  let deactivated = 0;
  const failures: Array<{ id: string; userId: string; reason: string }> = [];

  for (const integ of integrations as Array<{
    id: string;
    userId: string;
    drNrpgApiKey: string;
    drNrpgBaseUrl: string;
  }>) {
    const outcome = await probeOne(integ.drNrpgBaseUrl, integ.drNrpgApiKey);

    if (outcome.ok) {
      passed++;
      await (prisma as any).drNrpgIntegration.update({
        where: { id: integ.id },
        data: { lastSyncAt: new Date() },
      });
      continue;
    }

    failed++;
    failures.push({ id: integ.id, userId: integ.userId, reason: outcome.reason });

    // Count recent consecutive failures to decide on deactivation.
    // Heuristic: if lastSyncAt is older than 72h AND this probe failed auth,
    // mark inactive so dispatch stops trying.
    const existing = await (prisma as any).drNrpgIntegration.findUnique({
      where: { id: integ.id },
      select: { lastSyncAt: true },
    });
    const lastSync: Date | null = existing?.lastSyncAt ?? null;
    const stale =
      !lastSync || Date.now() - lastSync.getTime() > 72 * 60 * 60 * 1000;

    if (outcome.isAuthFailure && stale) {
      await (prisma as any).drNrpgIntegration.update({
        where: { id: integ.id },
        data: { isActive: false },
      });
      deactivated++;
    }
  }

  return {
    itemsProcessed: integrations.length,
    metadata: {
      passed,
      failed,
      deactivated,
      failures: failures.slice(0, 20), // cap payload size
    },
  };
}

type ProbeOutcome = { ok: true } | { ok: false; reason: string; isAuthFailure: boolean };

async function probeOne(baseUrl: string, apiKey: string): Promise<ProbeOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    // Generic health probe — GET the base URL with the API key.
    // DR-NRPG API contract (per app/api/dr-nrpg/connect/route.ts header) does
    // not publish a dedicated /health endpoint, so a GET to base returns the
    // API root response or 401 on bad auth — both observable outcomes.
    const res = await fetch(baseUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: `auth-failed-${res.status}`, isAuthFailure: true };
    }
    if (res.status >= 500) {
      return { ok: false, reason: `upstream-${res.status}`, isAuthFailure: false };
    }
    return { ok: true };
  } catch (err) {
    const name = err instanceof Error ? err.name : "unknown";
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: `fetch-${name}: ${msg.slice(0, 120)}`,
      isAuthFailure: false,
    };
  } finally {
    clearTimeout(timer);
  }
}
