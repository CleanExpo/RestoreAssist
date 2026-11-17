/**
 * RA-8428 — the hourly invoice-sync backstop must not skip invoices.
 *
 * The route used to read Integration.lastSyncAt as its cursor, take the 50
 * oldest changed invoices, then set lastSyncAt to "now". Invoice 51 onwards
 * fell behind the cursor and was never swept. lastSyncAt is also written by
 * the manual Sync button, client import and the OAuth callback, so any of
 * those hid unswept edits too. Integrations were taken oldest-created first,
 * capped at 100, so integration 101 was never visited.
 *
 * These tests drive the real route against an in-memory Prisma fake that
 * applies `where`, `orderBy` and `take`, so a cursor that jumps past rows
 * shows up as invoices that are never queued.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Row = Record<string, unknown>;

interface IntegrationRow extends Row {
  id: string;
  userId: string;
  workspaceId: string | null;
  provider: string;
  status: string;
  createdAt: Date;
  lastSyncAt: Date | null;
}

interface InvoiceRow extends Row {
  id: string;
  userId: string;
  workspaceId: string | null;
  status: string;
  updatedAt: Date;
  externalInvoiceId: string | null;
  externalSyncProvider: string | null;
}

interface CursorRow extends Row {
  integrationId: string;
  cursorAt: Date;
  cursorId: string | null;
  sweptAt: Date;
}

const db = {
  integrations: [] as IntegrationRow[],
  invoices: [] as InvoiceRow[],
  cursors: new Map<string, CursorRow>(),
};

const queued: string[] = [];
const failOnce = new Set<string>();

function cmp(a: unknown, b: unknown): number {
  const av = a instanceof Date ? a.getTime() : a;
  const bv = b instanceof Date ? b.getTime() : b;
  if (av === bv) return 0;
  if (av === null || av === undefined) return -1;
  if (bv === null || bv === undefined) return 1;
  return (av as number | string) < (bv as number | string) ? -1 : 1;
}

function fieldMatches(value: unknown, cond: unknown): boolean {
  if (cond === null) return value === null || value === undefined;
  if (cond instanceof Date || typeof cond !== "object") {
    return cmp(value, cond) === 0;
  }
  const ops = cond as Record<string, unknown>;
  for (const [op, operand] of Object.entries(ops)) {
    switch (op) {
      case "equals":
        if (!fieldMatches(value, operand)) return false;
        break;
      case "not":
        if (fieldMatches(value, operand)) return false;
        break;
      case "gt":
        if (value == null || cmp(value, operand) <= 0) return false;
        break;
      case "gte":
        if (value == null || cmp(value, operand) < 0) return false;
        break;
      case "lt":
        if (value == null || cmp(value, operand) >= 0) return false;
        break;
      case "lte":
        if (value == null || cmp(value, operand) > 0) return false;
        break;
      case "in":
        if (!(operand as unknown[]).some((v) => cmp(value, v) === 0))
          return false;
        break;
      default:
        throw new Error(`fake prisma: unsupported operator ${op}`);
    }
  }
  return true;
}

function relationOf(row: Row, key: string): Row | null {
  if (key === "invoiceSyncCursor") {
    return db.cursors.get(row.id as string) ?? null;
  }
  throw new Error(`fake prisma: unsupported relation ${key}`);
}

function matches(row: Row, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (key === "OR") {
      if (!(cond as Record<string, unknown>[]).some((w) => matches(row, w)))
        return false;
    } else if (key === "AND") {
      const all = Array.isArray(cond) ? cond : [cond];
      if (!all.every((w) => matches(row, w as Record<string, unknown>)))
        return false;
    } else if (key === "invoiceSyncCursor") {
      const rel = relationOf(row, key);
      const c = cond as Record<string, unknown> | null;
      if (c === null || (c && "is" in c && c.is === null)) {
        if (rel !== null) return false;
      } else if (c && "isNot" in c && c.isNot === null) {
        if (rel === null) return false;
      } else {
        throw new Error("fake prisma: unsupported relation filter");
      }
    } else if (!fieldMatches(row[key], cond)) {
      return false;
    }
  }
  return true;
}

type OrderBy = Record<string, unknown> | Record<string, unknown>[] | undefined;

function sortRows<T extends Row>(rows: T[], orderBy: OrderBy): T[] {
  const keys = !orderBy ? [] : Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const spec of keys) {
      const [field, dirSpec] = Object.entries(spec)[0];
      let av: unknown;
      let bv: unknown;
      let dir: unknown = dirSpec;
      if (dirSpec && typeof dirSpec === "object" && !("sort" in dirSpec)) {
        const [inner, innerDir] = Object.entries(dirSpec)[0];
        av = relationOf(a, field)?.[inner] ?? null;
        bv = relationOf(b, field)?.[inner] ?? null;
        dir = innerDir;
      } else {
        av = a[field];
        bv = b[field];
        if (dirSpec && typeof dirSpec === "object")
          dir = (dirSpec as { sort: string }).sort;
      }
      const c = cmp(av, bv);
      if (c !== 0) return dir === "desc" ? -c : c;
    }
    return 0;
  });
}

function findMany<T extends Row>(
  rows: T[],
  args: { where?: Record<string, unknown>; orderBy?: OrderBy; take?: number },
  withCursor: boolean,
) {
  const out = sortRows(
    rows.filter((r) => matches(r, args.where)),
    args.orderBy,
  ).slice(0, args.take ?? rows.length);
  return out.map((r) =>
    withCursor
      ? { ...r, invoiceSyncCursor: db.cursors.get(r.id as string) ?? null }
      : { ...r },
  );
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integration: {
      findMany: async (args: Record<string, unknown>) =>
        findMany(db.integrations, args, true),
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<IntegrationRow>;
      }) => {
        const row = db.integrations.find((i) => i.id === where.id);
        if (!row) throw new Error("not found");
        Object.assign(row, data);
        return { ...row };
      },
    },
    invoice: {
      findMany: async (args: Record<string, unknown>) =>
        findMany(db.invoices, args, false),
    },
    invoiceSyncCursor: {
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { integrationId: string };
        create: CursorRow;
        update: Partial<CursorRow>;
      }) => {
        const existing = db.cursors.get(where.integrationId);
        const next = existing ? { ...existing, ...update } : { ...create };
        db.cursors.set(where.integrationId, next);
        return next;
      },
    },
  },
}));

vi.mock("@/lib/services/integrations/select-oauth", () => ({
  OAUTH_CANDIDATE_WHERE: {},
}));
vi.mock("@/lib/integrations/identity", () => ({
  isOAuthIntegration: () => true,
}));
vi.mock("@/lib/integrations/zoho/queue", () => ({
  processZohoSyncBatch: async () => ({ processed: 0, failed: 0 }),
}));
vi.mock("@/lib/cron/auth", () => ({ verifyCronAuth: () => null }));
vi.mock("@/lib/cron/runner", () => ({
  runCronJob: async (_name: string, fn: () => Promise<unknown>) => fn(),
}));
vi.mock("@/lib/integrations/sync-queue", () => ({
  queueInvoiceSync: async (invoiceId: string) => {
    if (failOnce.delete(invoiceId)) throw new Error("queue unavailable");
    queued.push(invoiceId);
  },
}));

import { GET } from "../route";

const T0 = new Date("2026-11-18T00:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function at(ms: number) {
  return new Date(T0.getTime() + ms);
}

async function runAt(ms: number) {
  vi.setSystemTime(at(ms));
  const res = await GET(
    new NextRequest("http://localhost/api/cron/sync-invoices"),
  );
  expect(res.status).toBe(200);
}

function addIntegration(n: number, lastSyncAt: Date | null) {
  const row: IntegrationRow = {
    id: `int-${String(n).padStart(3, "0")}`,
    userId: `user-${n}`,
    workspaceId: `ws-${n}`,
    provider: "XERO",
    status: "CONNECTED",
    createdAt: new Date(T0.getTime() - 365 * 24 * HOUR + n * 1000),
    lastSyncAt,
  };
  db.integrations.push(row);
  return row;
}

function addInvoice(owner: IntegrationRow, id: string, updatedAt: Date) {
  const row: InvoiceRow = {
    id,
    userId: owner.userId,
    workspaceId: owner.workspaceId,
    status: "SENT",
    updatedAt,
    externalInvoiceId: null,
    externalSyncProvider: null,
  };
  db.invoices.push(row);
  return row;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  db.integrations = [];
  db.invoices = [];
  db.cursors.clear();
  queued.length = 0;
  failOnce.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("RA-8428 invoice-sync backstop cursor", () => {
  it("queues all 60 changed invoices over two runs when the batch holds 50", async () => {
    const integ = addIntegration(1, at(-2 * HOUR));
    for (let i = 1; i <= 60; i++) {
      // Invoices 50 and 51 share a timestamp, so the batch boundary falls
      // inside a run of equal updatedAt values.
      const sec = i === 51 ? 50 : i;
      addInvoice(
        integ,
        `inv-${String(i).padStart(3, "0")}`,
        at(-HOUR + sec * 1000),
      );
    }

    await runAt(0);
    await runAt(HOUR);

    expect(new Set(queued).size).toBe(60);
  });

  it("a manual sync writing lastSyncAt does not hide edits from the next run", async () => {
    const integ = addIntegration(1, at(-2 * HOUR));
    for (let i = 1; i <= 3; i++) {
      addInvoice(integ, `inv-a${i}`, at(-HOUR + i * 1000));
    }
    await runAt(0);
    expect(queued.sort()).toEqual(["inv-a1", "inv-a2", "inv-a3"]);

    // Five invoices are edited after the run.
    for (let i = 1; i <= 5; i++) {
      addInvoice(integ, `inv-b${i}`, at(10 * 60 * 1000 + i * 1000));
    }
    // The manual "Sync to Xero" button on one invoice writes lastSyncAt.
    integ.lastSyncAt = at(20 * 60 * 1000);

    queued.length = 0;
    await runAt(HOUR);
    expect(queued.sort()).toEqual([
      "inv-b1",
      "inv-b2",
      "inv-b3",
      "inv-b4",
      "inv-b5",
    ]);
  });

  it("sweeps every one of 101 connected integrations within two runs", async () => {
    for (let n = 1; n <= 101; n++) {
      const integ = addIntegration(n, at(-2 * HOUR));
      addInvoice(integ, `inv-${String(n).padStart(3, "0")}`, at(-HOUR));
    }

    await runAt(0);
    await runAt(HOUR);

    expect(new Set(queued).size).toBe(101);
  });

  it("does not move the cursor past an invoice that failed to queue", async () => {
    const integ = addIntegration(1, at(-2 * HOUR));
    for (let i = 1; i <= 5; i++) {
      addInvoice(integ, `inv-${i}`, at(-HOUR + i * 1000));
    }
    failOnce.add("inv-3");

    await runAt(0);
    await runAt(HOUR);

    expect(queued).toContain("inv-3");
    expect(new Set(queued)).toEqual(
      new Set(["inv-1", "inv-2", "inv-3", "inv-4", "inv-5"]),
    );
  });
});
