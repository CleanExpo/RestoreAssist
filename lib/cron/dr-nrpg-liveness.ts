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
import { decrypt } from "@/lib/credential-vault";
import { isEncryptedToken } from "@/lib/auth/account-tokens";
import type { CronJobResult } from "./runner";

const PROBE_TIMEOUT_MS = 10_000;
const MAX_CONSECUTIVE_FAILURES_BEFORE_DEACTIVATE = 3;
// Bounded batch per run — least-recently-probed first so the tail is never
// starved. See scaling note below.
const BATCH_SIZE = 100;

/**
 * Batching: a single run probes at most BATCH_SIZE active integrations,
 * ordered by `lastSyncAt` ascending with NULLs first (never-probed and
 * least-recently-probed go first). This bounds the per-invocation work so the
 * Vercel function (maxDuration 60s) is never killed mid-loop — which
 * previously meant later integrations were silently never probed, so a
 * revoked key on a tail integration would go undetected. Repeated daily runs
 * sweep the whole population least-recently-probed-first.
 *
 * Scaling assumption (TUNE if the integration population grows): the cron runs
 * DAILY (`30 18 * * *` in vercel.json: 18:30 UTC, 04:30 AEST).
 * BATCH_SIZE=100 covers 100 integrations/day. To keep
 * every active integration probed at least weekly, the active population must
 * stay under ~700. DrNrpgIntegration.userId is @unique, so the population is
 * bounded by the number of users with an integration — small today. Raise
 * BATCH_SIZE or frequency if active integrations approach that ceiling.
 */
export async function runDrNrpgLiveness(): Promise<CronJobResult> {
  const integrations = await (prisma as any).drNrpgIntegration.findMany({
    where: { isActive: true },
    // Least-recently-probed first (never-probed = lastSyncAt NULL first) so
    // the bounded batch always covers the most-overdue integrations.
    orderBy: { lastSyncAt: { sort: "asc", nulls: "first" } },
    take: BATCH_SIZE,
  });

  if (integrations.length === 0) {
    return {
      itemsProcessed: 0,
      metadata: { reason: "no-active-integrations" },
    };
  }

  let passed = 0;
  let failed = 0;
  let deactivated = 0;
  const failures: Array<{ id: string; userId: string; reason: string }> = [];
  // RA-8075: rows whose stored key cannot be decrypted, and whether any
  // encrypted row in this batch DID decrypt (proof the current vault key works).
  const undecryptableIds: string[] = [];
  let anyEncryptedDecrypted = false;

  for (const integ of integrations as Array<{
    id: string;
    userId: string;
    drNrpgApiKey: string;
    drNrpgBaseUrl: string;
  }>) {
    // Decrypt the stored API key for the outbound probe. Legacy plaintext rows
    // (pre-backfill) aren't in cipher shape, so pass them through unchanged.
    // A decrypt error is counted against that row and the loop continues;
    // a throw here used to end the run before any integration was probed.
    let drNrpgApiKey: string;
    if (isEncryptedToken(integ.drNrpgApiKey)) {
      try {
        drNrpgApiKey = decrypt(integ.drNrpgApiKey);
        anyEncryptedDecrypted = true;
      } catch {
        console.error(
          "[dr-nrpg-liveness] drNrpgApiKey could not be decrypted",
          { integrationId: integ.id },
        );
        failed++;
        failures.push({
          id: integ.id,
          userId: integ.userId,
          reason: "decrypt-failed",
        });
        undecryptableIds.push(integ.id);
        continue;
      }
    } else {
      drNrpgApiKey = integ.drNrpgApiKey;
    }
    const outcome = await probeOne(integ.drNrpgBaseUrl, drNrpgApiKey);

    if (outcome.ok) {
      passed++;
      await (prisma as any).drNrpgIntegration.update({
        where: { id: integ.id },
        data: { lastSyncAt: new Date() },
      });
      continue;
    }

    failed++;
    failures.push({
      id: integ.id,
      userId: integ.userId,
      reason: outcome.reason,
    });

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

  // Undecryptable rows are deactivated, not merely skipped: they are never
  // probed, so lastSyncAt never moves and they would hold the first slots of
  // every future batch. A key encrypted under another vault key can never be
  // used (neither probe nor dispatch), and reconnecting via
  // /api/dr-nrpg/connect re-encrypts and reactivates the row.
  // Guard: only when another encrypted row in this batch decrypted, proving
  // the current key is sound. If none did, the deployed vault key itself is
  // the likely fault, and deactivating would switch off every business.
  const decryptKeySuspect = undecryptableIds.length > 0 && !anyEncryptedDecrypted;
  if (!decryptKeySuspect) {
    for (const id of undecryptableIds) {
      await (prisma as any).drNrpgIntegration.update({
        where: { id },
        data: { isActive: false },
      });
      deactivated++;
    }
  } else {
    console.error(
      "[dr-nrpg-liveness] no encrypted API key in this batch could be decrypted — vault key misconfiguration suspected; nothing deactivated",
      { undecryptable: undecryptableIds.length },
    );
  }

  return {
    itemsProcessed: integrations.length,
    metadata: {
      passed,
      failed,
      deactivated,
      decryptKeySuspect,
      failures: failures.slice(0, 20), // cap payload size
    },
  };
}

type ProbeOutcome =
  | { ok: true }
  | { ok: false; reason: string; isAuthFailure: boolean };

async function probeOne(
  baseUrl: string,
  apiKey: string,
): Promise<ProbeOutcome> {
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
      return {
        ok: false,
        reason: `auth-failed-${res.status}`,
        isAuthFailure: true,
      };
    }
    if (res.status >= 500) {
      return {
        ok: false,
        reason: `upstream-${res.status}`,
        isAuthFailure: false,
      };
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
