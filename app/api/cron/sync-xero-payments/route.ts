import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OAUTH_CANDIDATE_WHERE } from "@/lib/services/integrations/select-oauth";
import { isOAuthIntegration } from "@/lib/integrations/identity";
import { verifyCronAuth } from "@/lib/cron/auth";
import { runCronJob } from "@/lib/cron/runner";
import { getValidXeroAccessToken } from "@/lib/services/xero/credentials";
import { processXeroWebhookBatch } from "@/lib/integrations/xero/webhook-processor";

const MAX_XERO_INTEGRATIONS_PER_CRON_RUN = 100;
const CRON_JOB_NAME = "sync-xero-payments";
/** Xero calls per integration per run; unchanged from before RA-8425. */
const INVOICES_POLLED_PER_INTEGRATION = 50;
/** Xero statuses for an invoice that will never be paid. */
const XERO_VOID_STATUSES = new Set(["VOIDED", "DELETED"]);

/**
 * RA-8425: where each integration's poll resumes, keyed by integration id,
 * read from the last completed run's metadata. Kept on the run record, not on
 * Integration.config: config and updatedAt are part of the Xero binding
 * compare-and-swap (lib/services/xero/binding.ts), so writing there every 15
 * minutes would fail in-flight token refreshes. Anything unreadable means
 * "start from the beginning", never a failed run.
 */
async function readPollCursors(): Promise<Record<string, string>> {
  try {
    const lastRun = await prisma.cronJobRun.findFirst({
      where: { jobName: CRON_JOB_NAME, status: "completed" },
      orderBy: { startedAt: "desc" },
      select: { metadata: true },
    });
    const parsed: unknown = lastRun?.metadata ? JSON.parse(lastRun.metadata) : null;
    const stored = parsed && typeof parsed === "object"
      ? (parsed as { pollCursors?: unknown }).pollCursors
      : undefined;
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
    return Object.fromEntries(
      Object.entries(stored).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0,
      ),
    );
  } catch (err) {
    console.warn("[Xero Payment Sync] Could not read poll cursors; starting from the beginning:", err);
    return {};
  }
}

/** Xero amounts are decimal dollars; Invoice amounts are integer cents. */
function xeroDollarsToCents(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value * 100)
    : null;
}

/**
 * GET /api/cron/sync-xero-payments — Fallback payment reconciliation for Xero
 *
 * This cron job is the safety net for missed webhook events (Xero webhooks can
 * fail or be delayed). It:
 *   1. Processes any PENDING WebhookEvent rows via the webhook-processor (RA-871).
 *   2. Polls Xero for AUTHORISED invoices that should now be PAID (up to 50 per
 *      integration per run, resuming where the last run stopped; RA-8425).
 *
 * Called by Vercel Cron (every 15 min): * /15 * * * * (RA-6964 — wired into
 * vercel.json; the route existed but was never scheduled, so this queue
 * only drained on a manual trigger).
 * Secured by CRON_SECRET bearer token via verifyCronAuth (timing-safe comparison).
 *
 * Integration rule: sync failures NEVER block user-facing operations.
 * This route always returns 200 with structured stats — never 5xx.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  // RA-1315: wrap in runCronJob as a guard against overlapping 15-minute cron
  // invocations (e.g. during a slow Xero poll). RA-7774: it checks for a
  // running row and creates one under a per-job advisory lock, so two
  // invocations that start together cannot both reconcile.
  const jobResult = await runCronJob(CRON_JOB_NAME, async () => {
    return await syncXeroPaymentsOnce();
  });

  return NextResponse.json({
    success: true,
    ...jobResult,
    timestamp: new Date().toISOString(),
  });
}

async function syncXeroPaymentsOnce() {
  const stats = {
    webhookEventsProcessed: 0,
    webhookEventsFailed: 0,
    webhookEventsSkipped: 0,
    invoicesPolled: 0,
    invoicesMarkedPaid: 0,
    // RA-8425: never paid, so reported on their own rather than as errors.
    // The local status is left alone; mapping a Xero void to a local status
    // is a product decision this cron does not make.
    invoicesVoidedOrDeletedInXero: 0,
    invoicesNotFoundInXero: 0,
    integrationErrors: 0,
    invoiceErrors: 0,
  };

  // ── Phase 1: Drain pending webhook events ────────────────────────────────
  try {
    const batchResult = await processXeroWebhookBatch(50);
    stats.webhookEventsProcessed = batchResult.processed;
    stats.webhookEventsFailed = batchResult.failed;
    stats.webhookEventsSkipped = batchResult.skipped;
  } catch (err) {
    console.error("[Xero Payment Sync] Webhook batch processing error:", err);
    // Non-fatal — continue to polling phase
  }

  // ── Phase 2: Fallback polling — find AUTHORISED invoices and check if paid ─
  const xeroIntegrations = await prisma.integration.findMany({
    where: {
      ...OAUTH_CANDIDATE_WHERE,
      provider: "XERO",
      status: "CONNECTED",
    },
    select: {
      name: true, icon: true, config: true, workspaceId: true,
      tokenExpiresAt: true, realmId: true, companyId: true,
      id: true,
      provider: true, tenantId: true,
      userId: true,
    },
    orderBy: { createdAt: "asc" },
    take: MAX_XERO_INTEGRATIONS_PER_CRON_RUN,
  });

  const previousCursors = await readPollCursors();
  // An integration skipped this run (credential failure, query error) keeps
  // its previous cursor; integrations no longer listed are dropped.
  const nextCursors: Record<string, string> = Object.fromEntries(
    xeroIntegrations
      .filter((integration) => Object.hasOwn(previousCursors, integration.id))
      .map((integration) => [integration.id, previousCursors[integration.id]]),
  );

  for (const integration of xeroIntegrations) {
    if (!isOAuthIntegration(integration, "XERO") || !integration.tenantId) continue;
    const cursor: string | undefined = previousCursors[integration.id];

    try {
      // Service-layer credentials result — log + continue on failure so a single
      // disconnected integration doesn't abort the rest of the cron run.
      const credResult = await getValidXeroAccessToken(integration.id, { expectedTenantId: integration.tenantId ?? undefined, expectedUserId: integration.userId, expectedWorkspaceId: integration.workspaceId });
      if (!credResult.ok) {
        stats.integrationErrors++;
        console.error("[CronSyncXeroPayments]", {
          integrationId: integration.id,
          reason: credResult.reason,
          detail: credResult.detail,
        });
        continue;
      }
      const accessToken = credResult.data;

      // Find local invoices that are AUTHORISED (sent to Xero) but not yet PAID,
      // limited to 50 per integration to stay within cron time budget
      // RA-8425: keyset pages on invoice id, resuming after the last invoice
      // the previous run selected. The old oldest-updatedAt-first order never
      // moved an unpaid, voided or deleted invoice, so the same 50 were polled
      // every run. Pass 1 takes ids after the cursor; if that page is short,
      // pass 2 wraps to the start of the set (ids up to the cursor), so no
      // invoice is polled twice in one run.
      const idPasses: (Prisma.StringFilter | undefined)[] =
        cursor === undefined ? [undefined] : [{ gt: cursor }, { lte: cursor }];
      const pendingInvoices: { id: string; externalInvoiceId: string | null }[] = [];
      for (const idFilter of idPasses) {
        const remaining = INVOICES_POLLED_PER_INTEGRATION - pendingInvoices.length;
        if (remaining <= 0) break;
        const page = await prisma.invoice.findMany({
          where: {
            userId: integration.userId,
            workspaceId: integration.workspaceId,
            status: { in: ["SENT", "OVERDUE", "PARTIALLY_PAID"] },
            externalInvoiceId: { not: null },
            externalSyncProvider: { in: ["XERO", "xero"] },
            ...(idFilter ? { id: idFilter } : {}),
          },
          select: {
            id: true,
            externalInvoiceId: true,
          },
          take: remaining,
          orderBy: { id: "asc" },
        });
        pendingInvoices.push(...page);
      }
      // Advance by what was selected, not by what succeeded, so an invoice
      // that always errors cannot hold the front of the line either.
      const lastSelected = pendingInvoices.at(-1);
      if (lastSelected) nextCursors[integration.id] = lastSelected.id;

      stats.invoicesPolled += pendingInvoices.length;

      for (const invoice of pendingInvoices) {
        if (!invoice.externalInvoiceId) continue;

        try {
          // Poll Xero for the current invoice status
          const res = await fetch(
            `https://api.xero.com/api.xro/2.0/Invoices/${invoice.externalInvoiceId}`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Xero-tenant-id": integration.tenantId!,
                Accept: "application/json",
              },
            },
          );

          if (!res.ok) {
            // 404 means the invoice was deleted/voided in Xero — skip gracefully
            if (res.status === 404) {
              stats.invoicesNotFoundInXero++;
              console.warn(
                `[Xero Payment Sync] Invoice ${invoice.externalInvoiceId} not found in Xero (404) — skipping`,
              );
              continue;
            }
            throw new Error(
              `Xero API ${res.status} for invoice ${invoice.externalInvoiceId}`,
            );
          }

          const data = await res.json();
          if (!Array.isArray(data?.Invoices) || data.Invoices.length !== 1 || !data.Invoices[0]) {
            throw new Error("Xero returned an invalid invoice response");
          }
          const xeroInvoice = data.Invoices[0];

          // RA-8425: checked before the settled test below. A voided or deleted
          // invoice can report AmountDue 0, which would otherwise mark it PAID.
          if (XERO_VOID_STATUSES.has(xeroInvoice.Status)) {
            stats.invoicesVoidedOrDeletedInXero++;
            console.warn(
              `[Xero Payment Sync] Invoice ${invoice.id} is ${xeroInvoice.Status} in Xero — not marking paid`,
            );
            continue;
          }

          // Xero status PAID or AmountDue === 0 means fully settled
          if (xeroInvoice.Status === "PAID" || xeroInvoice.AmountDue === 0) {
            // RA-7645: carry Xero's own figures (dollars) as cents. Not
            // totalIncGST: a credit note can settle part of an invoice, so
            // the amount actually paid may be less than the total.
            const amountPaid = xeroDollarsToCents(xeroInvoice.AmountPaid);
            await prisma.invoice.update({
              where: { id: invoice.id, userId: integration.userId, workspaceId: integration.workspaceId, externalInvoiceId: invoice.externalInvoiceId, externalSyncProvider: { in: ["XERO", "xero"] } },
              data: {
                status: "PAID",
                paidDate: xeroInvoice.FullyPaidOnDate
                  ? new Date(xeroInvoice.FullyPaidOnDate)
                  : new Date(),
                ...(amountPaid === null ? {} : { amountPaid }),
                amountDue: xeroDollarsToCents(xeroInvoice.AmountDue) ?? 0,
              },
            });
            stats.invoicesMarkedPaid++;
            console.log(
              `[Xero Payment Sync] Polled PAID → invoice ${invoice.id} (Xero ${invoice.externalInvoiceId})`,
            );
          }
        } catch (invoiceErr) {
          stats.invoiceErrors++;
          // Single-invoice error — log and continue; do not abort the integration run
          console.error(
            `[Xero Payment Sync] Error checking invoice ${invoice.id}:`,
            invoiceErr,
          );
        }
      }
    } catch (integrationErr) {
      stats.integrationErrors++;
      console.error(
        `[Xero Payment Sync] Error processing integration ${integration.id}:`,
        integrationErr,
      );
      // Do not abort — process remaining integrations
    }
  }

  return {
    itemsProcessed: stats.webhookEventsProcessed + stats.invoicesMarkedPaid,
    metadata: { ...stats, pollCursors: nextCursors },
  };
}

/**
 * POST /api/cron/sync-xero-payments — Manual trigger (same auth, useful for testing)
 */
export async function POST(request: NextRequest) {
  return GET(request);
}
