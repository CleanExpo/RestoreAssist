/**
 * RA-8426 — a webhook event left PROCESSING by a run that died is released
 * by the scheduled drains, and a live claim is left alone.
 *
 * The WebhookEvent table is an in-memory store that evaluates the `where`
 * filters the code sends, so the stale rule is exercised, not assumed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = {
  id: string;
  provider: string;
  integrationId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: string;
  errorMessage: string | null;
  retryCount: number;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const rows: Row[] = [];
const calls: string[] = [];
let clock = new Date("2026-11-17T12:00:00Z");

function matches(row: Row, where: Record<string, any>): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const value = (row as any)[key];
    if (cond !== null && typeof cond === "object" && !(cond instanceof Date)) {
      if ("lt" in cond && !(value < cond.lt)) return false;
      if ("gte" in cond && !(value >= cond.gte)) return false;
      if ("in" in cond && !cond.in.includes(value)) return false;
      if ("notIn" in cond && cond.notIn.includes(value)) return false;
      return true;
    }
    return value === cond;
  });
}

function apply(row: Row, data: Record<string, any>) {
  for (const [key, value] of Object.entries(data)) {
    if (value !== null && typeof value === "object" && "increment" in value) {
      (row as any)[key] += value.increment;
    } else {
      (row as any)[key] = value;
    }
  }
  row.updatedAt = clock; // @updatedAt
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    webhookEvent: {
      findMany: vi.fn(async ({ where, take }: any) => {
        calls.push("findMany");
        return rows
          .filter((r) => matches(r, where))
          .sort((a, b) => +a.createdAt - +b.createdAt)
          .slice(0, take)
          .map((r) => ({ ...r }));
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        calls.push(`updateMany:${where.status}->${data.status}`);
        const hit = rows.filter((r) => matches(r, where));
        hit.forEach((r) => apply(r, data));
        return { count: hit.length };
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = rows.find((r) => r.id === where.id)!;
        apply(row, data);
        return { ...row };
      }),
    },
    integration: {
      findUnique: vi.fn(async () => ({
        id: "integ-1",
        userId: "u-1",
        workspaceId: "workspace-1",
        provider: "XERO",
        name: "Xero",
        icon: null,
        config: null,
        tenantId: "tenant-abc",
        status: "CONNECTED",
      })),
    },
    invoice: {
      // The Xero invoice is not in RestoreAssist: the handler completes
      // without touching invoices, which is all this test needs.
      findFirst: vi.fn(async () => null),
      update: vi.fn(),
    },
  },
}));
vi.mock("@/lib/integrations/sync-queue", () => ({ queueInvoiceSync: vi.fn() }));
vi.mock("@/lib/services/xero/credentials", () => ({
  getValidXeroAccessToken: vi.fn(),
}));

import { processXeroWebhookBatch } from "@/lib/integrations/xero/webhook-processor";
import { processQboMyobPendingPayments } from "@/lib/integrations/webhook-processor";
import { processWebhookQueue, retryFailedEvents } from "@/lib/jobs/webhook-queue";
import { getValidXeroAccessToken } from "@/lib/services/xero/credentials";
import { XERO_REQUEST_TIMEOUT_MS } from "@/lib/integrations/xero/request-timeout";
import {
  reclaimStaleWebhookEvents,
  WEBHOOK_MAX_RETRIES,
  WEBHOOK_STALE_CLAIM_MS,
} from "@/lib/jobs/webhook-reclaim";

const minutesAgo = (m: number) => new Date(clock.getTime() - m * 60_000);

function event(id: string, overrides: Partial<Row> = {}): Row {
  return {
    id,
    provider: "XERO",
    integrationId: "integ-1",
    eventType: "invoice.updated",
    payload: { resourceId: `xero-inv-${id}`, tenantId: "tenant-abc" },
    status: "PENDING",
    errorMessage: null,
    retryCount: 0,
    processedAt: null,
    createdAt: minutesAgo(120),
    updatedAt: minutesAgo(120),
    ...overrides,
  };
}

const row = (id: string) => rows.find((r) => r.id === id)!;

function setClock(at: Date) {
  clock = at;
  vi.setSystemTime(at); // the code under test reads `new Date()`
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

beforeEach(() => {
  rows.length = 0;
  calls.length = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  setClock(new Date("2026-11-17T12:00:00Z"));
  vi.spyOn(global, "fetch").mockRejectedValue(
    new Error("No network in webhook reclaim tests"),
  );
});

describe("reclaimStaleWebhookEvents through the Xero drain", () => {
  it("releases and processes a stale PROCESSING event, and leaves a fresh one alone", async () => {
    rows.push(
      event("stale", { status: "PROCESSING", updatedAt: minutesAgo(60) }),
      event("fresh", { status: "PROCESSING", updatedAt: minutesAgo(2) }),
    );

    const result = await processXeroWebhookBatch();

    expect(row("stale").status).toBe("COMPLETED");
    expect(row("stale").retryCount).toBe(1);
    // The interruption note does not outlive a successful attempt.
    expect(row("stale").errorMessage).toBeNull();
    expect(result.processed).toBe(1);

    expect(row("fresh").status).toBe("PROCESSING");
    expect(row("fresh").retryCount).toBe(0);
  });

  it("does not release a claim exactly at the age limit", async () => {
    rows.push(
      event("edge", {
        status: "PROCESSING",
        updatedAt: new Date(clock.getTime() - WEBHOOK_STALE_CLAIM_MS),
      }),
    );

    await processXeroWebhookBatch();

    expect(row("edge").status).toBe("PROCESSING");
  });

  it("an event that kills its run every time ends FAILED at the bound and stays there", async () => {
    rows.push(event("poison", { status: "PROCESSING", updatedAt: minutesAgo(60) }));

    let releases = 0;
    for (let tick = 0; tick < 20; tick++) {
      setClock(new Date(clock.getTime() + 15 * 60_000));
      await reclaimStaleWebhookEvents();
      await retryFailedEvents({ maxRetries: WEBHOOK_MAX_RETRIES });
      if (row("poison").status === "PENDING") {
        releases++;
        // The drain claims it again and the run dies again.
        apply(row("poison"), { status: "PROCESSING" });
      }
    }

    expect(row("poison").status).toBe("FAILED");
    expect(row("poison").retryCount).toBe(WEBHOOK_MAX_RETRIES);
    expect(releases).toBe(WEBHOOK_MAX_RETRIES - 1);
  });
});

describe("the Xero payment lookup made while a claim is held", () => {
  it("has a time limit, so a hung call cannot outlive the stale-claim age", async () => {
    vi.mocked(getValidXeroAccessToken).mockResolvedValue({ ok: true, data: "token" } as never);
    let init: RequestInit | undefined;
    vi.spyOn(global, "fetch").mockImplementation(async (_url, options) => {
      init = options;
      throw new Error("stop after the request is made");
    });
    rows.push(
      event("pay", {
        eventType: "payment.created",
        payload: { resourceId: "xero-pay-1", resourceType: "PAYMENT", tenantId: "tenant-abc" },
      }),
    );

    await processXeroWebhookBatch();

    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(XERO_REQUEST_TIMEOUT_MS).toBeLessThan(WEBHOOK_STALE_CLAIM_MS / 4);
  });
});

describe("processWebhookQueue (the manual drain)", () => {
  it("expires stale claims before it selects its batch", async () => {
    await processWebhookQueue();

    const firstSelect = calls.indexOf("findMany");
    expect(firstSelect).toBeGreaterThan(0);
    expect(calls.slice(0, firstSelect)).toEqual([
      "updateMany:PROCESSING->FAILED",
      "updateMany:PROCESSING->PENDING",
    ]);
  });
});

describe("the QuickBooks and MYOB drain", () => {
  it("expires stale claims before it selects its batch", async () => {
    await processQboMyobPendingPayments();

    const firstSelect = calls.indexOf("findMany");
    expect(firstSelect).toBeGreaterThan(0);
    expect(calls.slice(0, firstSelect)).toEqual([
      "updateMany:PROCESSING->FAILED",
      "updateMany:PROCESSING->PENDING",
    ]);
  });
});
