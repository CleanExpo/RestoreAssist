/**
 * Durable Zoho outbound queue.
 *
 * A customer or job write enqueues one upsert per (user, entity). The
 * invoice-sync cron drains it, and enqueue also kicks a batch so a live
 * connection does not wait for the hour. Failures retry, then dead-letter.
 * Nothing here is awaited by the request that triggered it.
 */

import { prisma } from "@/lib/prisma";
import { selectOAuthIntegration } from "@/lib/services/integrations/select-oauth";
import { DEFAULT_RETRY_OPTIONS, retryWithExponentialBackoff } from "../retry";
import {
  accountUpsertBody,
  contactUpsertBody,
  dealUpsertBody,
  type RaCustomerPush,
  type RaJobPush,
} from "./map";
import { ZohoClient } from "./client";

const MAX_ATTEMPTS = 3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function zohoIdFrom(raw: unknown): string | null {
  if (!isRecord(raw)) return null;
  return typeof raw.zohoId === "string" && raw.zohoId.trim() ? raw.zohoId : null;
}

export function scheduleZohoCustomerPush(userId: string, customer: RaCustomerPush): void {
  void enqueueZohoCustomer(userId, customer).catch((err) => {
    console.error(
      "[zoho] customer push failed",
      err instanceof Error ? err.message : "error",
    );
  });
}

export function scheduleZohoInspectionPush(inspectionId: string): void {
  void enqueueZohoInspection(inspectionId).catch((err) => {
    console.error(
      "[zoho] job push failed",
      err instanceof Error ? err.message : "error",
    );
  });
}

async function enqueueZohoInspection(inspectionId: string): Promise<void> {
  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      id: true,
      userId: true,
      inspectionNumber: true,
      propertyAddress: true,
      status: true,
      lossDescription: true,
    },
  });
  if (!inspection) return;
  await enqueueZohoJob(inspection.userId, {
    id: inspection.id,
    number: inspection.inspectionNumber,
    address: inspection.propertyAddress,
    status: inspection.status,
    description: inspection.lossDescription,
  });
}

export function scheduleZohoJobPush(userId: string, job: RaJobPush): void {
  void enqueueZohoJob(userId, job).catch((err) => {
    console.error(
      "[zoho] job push failed",
      err instanceof Error ? err.message : "error",
    );
  });
}

export async function enqueueZohoCustomer(userId: string, customer: RaCustomerPush): Promise<void> {
  const selection = await selectOAuthIntegration({
    prisma,
    userId,
    provider: "ZOHO",
    requireReady: true,
  });
  if (!selection.ok) return;
  const linked = await prisma.externalClient.findUnique({
    where: {
      integrationId_externalId: {
        integrationId: selection.data.id,
        externalId: `ra-customer:${customer.id}`,
      },
    },
    select: { rawData: true },
  });
  const accountLink = await prisma.externalClient.findUnique({
    where: {
      integrationId_externalId: {
        integrationId: selection.data.id,
        externalId: `ra-account:${customer.id}`,
      },
    },
    select: { rawData: true },
  });
  const payload = {
    ...customer,
    zohoContactId: customer.zohoContactId ?? zohoIdFrom(linked?.rawData),
    zohoAccountId: customer.zohoAccountId ?? zohoIdFrom(accountLink?.rawData),
  };
  await prisma.zohoSyncJob.upsert({
    where: { userId_entityType_entityId: { userId, entityType: "CUSTOMER", entityId: customer.id } },
    create: { userId, entityType: "CUSTOMER", entityId: customer.id, payload, status: "PENDING" },
    update: { payload, status: "PENDING", errorMessage: null, retryCount: 0 },
  });
  void processZohoSyncBatch().catch((err) => {
    console.error("[zoho] outbound batch failed", err instanceof Error ? err.message : "error");
  });
}

export async function enqueueZohoJob(userId: string, job: RaJobPush): Promise<void> {
  const selection = await selectOAuthIntegration({
    prisma,
    userId,
    provider: "ZOHO",
    requireReady: true,
  });
  if (!selection.ok) return;
  const linked = await prisma.externalJob.findUnique({
    where: {
      integrationId_externalId: {
        integrationId: selection.data.id,
        externalId: `ra-job:${job.id}`,
      },
    },
    select: { rawData: true },
  });
  const payload = { ...job, zohoDealId: job.zohoDealId ?? zohoIdFrom(linked?.rawData) };
  await prisma.zohoSyncJob.upsert({
    where: { userId_entityType_entityId: { userId, entityType: "JOB", entityId: job.id } },
    create: { userId, entityType: "JOB", entityId: job.id, payload, status: "PENDING" },
    update: { payload, status: "PENDING", errorMessage: null, retryCount: 0 },
  });
  void processZohoSyncBatch().catch((err) => {
    console.error("[zoho] outbound batch failed", err instanceof Error ? err.message : "error");
  });
}

export async function processZohoSyncBatch(
  maxJobs = 20,
): Promise<{ processed: number; failed: number }> {
  const jobs = await prisma.zohoSyncJob.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: maxJobs,
  });
  let processed = 0;
  let failed = 0;
  for (const job of jobs) {
    const locked = await prisma.zohoSyncJob.updateMany({
      where: { id: job.id, status: "PENDING" },
      data: { status: "PROCESSING" },
    });
    if (locked.count === 0) continue;
    try {
      await retryWithExponentialBackoff(
        () => deliverZohoJob(job.userId, job.entityType, job.payload),
        DEFAULT_RETRY_OPTIONS,
      );
      await prisma.zohoSyncJob.update({
        where: { id: job.id },
        data: { status: "COMPLETED", completedAt: new Date(), errorMessage: null },
      });
      await prisma.integration.updateMany({
        where: { userId: job.userId, provider: "ZOHO", status: { in: ["CONNECTED", "ERROR"] } },
        data: { syncError: null, status: "CONNECTED" },
      });
      processed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Zoho upsert failed";
      const retryCount = job.retryCount + 1;
      const dead = retryCount >= MAX_ATTEMPTS;
      await prisma.zohoSyncJob.update({
        where: { id: job.id },
        data: {
          status: dead ? "FAILED" : "PENDING",
          retryCount,
          errorMessage: message.slice(0, 500),
        },
      });
      if (dead) {
        console.error(
          `[DEAD-LETTER] [zoho] job ${job.id} failed after ${retryCount} attempts entity=${job.entityType}`,
        );
        await prisma.integration.updateMany({
          where: { userId: job.userId, provider: "ZOHO", status: { in: ["CONNECTED", "ERROR", "SYNCING"] } },
          data: { status: "ERROR", syncError: message.slice(0, 500) },
        });
      }
      failed++;
    }
  }
  return { processed, failed };
}

async function deliverZohoJob(userId: string, entityType: string, payload: unknown): Promise<void> {
  const selection = await selectOAuthIntegration({
    prisma,
    userId,
    provider: "ZOHO",
    requireReady: true,
  });
  if (!selection.ok) throw new Error("No active Zoho connection");
  const client = new ZohoClient(selection.data.id);
  if (entityType === "CUSTOMER") {
    const customer = payload as RaCustomerPush;
    const accountBody = accountUpsertBody(customer);
    let zohoAccountId = customer.zohoAccountId ?? null;
    if (accountBody) {
      zohoAccountId = await client.upsertRecord("Accounts", accountBody);
      await rememberExternal(selection.data.id, "client", `ra-account:${customer.id}`, customer.company || "Account", {
        zohoId: zohoAccountId,
      });
    }
    const contactId = await client.upsertRecord(
      "Contacts",
      contactUpsertBody({ ...customer, zohoAccountId }),
    );
    await rememberExternal(selection.data.id, "client", `ra-customer:${customer.id}`, customer.name, {
      zohoId: contactId,
    });
    return;
  }
  if (entityType === "JOB") {
    const job = payload as RaJobPush;
    const dealId = await client.upsertRecord("Deals", dealUpsertBody(job));
    await prisma.externalJob.upsert({
      where: {
        integrationId_externalId: {
          integrationId: selection.data.id,
          externalId: `ra-job:${job.id}`,
        },
      },
      create: {
        integrationId: selection.data.id,
        externalId: `ra-job:${job.id}`,
        title: job.address,
        status: job.status,
        description: job.description,
        rawData: { zohoId: dealId },
      },
      update: {
        title: job.address,
        status: job.status,
        description: job.description,
        rawData: { zohoId: dealId },
        lastSyncedAt: new Date(),
      },
    });
    return;
  }
  throw new Error(`Unknown Zoho entity ${entityType}`);
}

async function rememberExternal(
  integrationId: string,
  kind: "client",
  externalId: string,
  name: string,
  rawData: { zohoId: string },
): Promise<void> {
  if (kind !== "client") return;
  await prisma.externalClient.upsert({
    where: { integrationId_externalId: { integrationId, externalId } },
    create: { integrationId, externalId, name, rawData },
    update: { name, rawData, lastSyncedAt: new Date() },
  });
}
