/**
 * RA-8273 — an invoice can only be mutated while it is DRAFT, and that is
 * checked under the row lock, not before the transaction.
 *
 * The bug: PUT /api/invoices/[id] read the status, saw DRAFT, and only then
 * opened its transaction and took `SELECT ... FOR UPDATE` (D-025). It never
 * looked at the status again. A second connection that committed SENT in the
 * gap let the stale edit replace the lines of an invoice already sent to the
 * customer, and answer 200. DELETE had the same shape: status read, then an
 * unlocked delete.
 *
 * The race, on real Postgres and through the real handlers, with no mocks of
 * the database:
 *   1. A second connection (T0) opens a transaction and takes the invoice row
 *      lock.
 *   2. The edit starts. It passes its pre-transaction DRAFT check (the row is
 *      still DRAFT) and blocks on the lock. The test waits until
 *      pg_stat_activity shows it blocked.
 *   3. T0 commits status SENT and releases the lock.
 *   4. The edit resumes. It must answer 409 and change nothing.
 *
 * Positive controls: a plain draft edit and a plain draft delete still succeed.
 *
 * Runs only when DATABASE_URL is set (`npm run test:db`). Session is mocked;
 * Prisma is real.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { Client } from "pg";

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { prisma } from "@/lib/prisma";
import { POST } from "../route";
import { DELETE, PUT } from "../[id]/route";

const S = `inv-status-lock-${Date.now().toString(36)}`;
let userId = "";

const LOCK_WAIT_POLL_MS = 25;
const LOCK_WAIT_DEADLINE_MS = 5_000;

function asOwner() {
  getServerSession.mockResolvedValue({ user: { id: userId } });
}

async function createDraft(quantity: number): Promise<string> {
  asOwner();
  const res = await POST(
    new NextRequest("http://localhost/api/invoices", {
      method: "POST",
      body: JSON.stringify({
        customerName: "Synthetic Customer",
        customerEmail: "synthetic@example.test",
        dueDate: new Date(Date.now() + 864e5).toISOString(),
        lineItems: [{ description: "Drying", quantity, unitPrice: 10000 }],
      }),
      headers: { "content-type": "application/json" },
    }),
  );
  expect(res.status).toBe(201);
  return (await res.json()).invoice.id as string;
}

function put(invoiceId: string, body: Record<string, unknown>) {
  asOwner();
  return PUT(
    new NextRequest(`http://localhost/api/invoices/${invoiceId}`, {
      method: "PUT",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id: invoiceId }) },
  );
}

function del(invoiceId: string) {
  asOwner();
  return DELETE(
    new NextRequest(`http://localhost/api/invoices/${invoiceId}`, {
      method: "DELETE",
    }),
    { params: Promise.resolve({ id: invoiceId }) },
  );
}

async function waitForBlockedWaiter(holderPid: number): Promise<void> {
  const started = Date.now();
  while (true) {
    const waiters = await prisma.$queryRaw<Array<{ pid: number | bigint }>>(
      Prisma.sql`
        SELECT pid FROM pg_stat_activity
        WHERE pid <> ${holderPid}
          AND wait_event_type = 'Lock'
          AND query ILIKE '%"Invoice"%'
        LIMIT 1
      `,
    );
    if (waiters.length > 0) return;
    if (Date.now() - started >= LOCK_WAIT_DEADLINE_MS) {
      throw new Error(
        `RA-8273: the request never blocked on the Invoice row within ${LOCK_WAIT_DEADLINE_MS}ms`,
      );
    }
    await new Promise((r) => setTimeout(r, LOCK_WAIT_POLL_MS));
  }
}

/**
 * Start `request` while a second connection holds the invoice row lock, then
 * commit SENT on that second connection and let the request resume.
 */
async function raceAgainstSent(
  invoiceId: string,
  request: () => Promise<Response>,
): Promise<Response> {
  const t0 = new Client({ connectionString: process.env.DATABASE_URL });
  await t0.connect();
  try {
    await t0.query("BEGIN");
    await t0.query(`SELECT "id" FROM "Invoice" WHERE "id" = $1 FOR UPDATE`, [
      invoiceId,
    ]);
    const pid = Number(
      (await t0.query("SELECT pg_backend_pid() AS pid")).rows[0].pid,
    );
    const pending = request();
    await waitForBlockedWaiter(pid);
    await t0.query(
      `UPDATE "Invoice" SET "status" = 'SENT', "sentDate" = now() WHERE "id" = $1`,
      [invoiceId],
    );
    await t0.query("COMMIT");
    return await pending;
  } finally {
    await t0.end();
  }
}

async function snapshot(invoiceId: string) {
  return prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      status: true,
      customerName: true,
      subtotalExGST: true,
      gstAmount: true,
      totalIncGST: true,
      amountDue: true,
      lineItems: {
        orderBy: { sortOrder: "asc" },
        select: { description: true, quantity: true, subtotal: true },
      },
    },
  });
}

describe.skipIf(!process.env.DATABASE_URL)(
  "RA-8273: invoice mutations re-check DRAFT under the row lock",
  () => {
    beforeAll(async () => {
      const u = await prisma.user.create({
        data: { email: `${S}@test.local`, role: "ADMIN", subscriptionStatus: "TRIAL" },
      });
      userId = u.id;
      const org = await prisma.organization.create({
        data: { name: S, ownerId: u.id, country: "AU" },
      });
      await prisma.user.update({
        where: { id: u.id },
        data: { organizationId: org.id },
      });
    });

    afterAll(async () => {
      await prisma.invoice.deleteMany({ where: { userId } });
      await prisma.invoiceSequence.deleteMany({ where: { userId } });
      await prisma.user.updateMany({
        where: { id: userId },
        data: { organizationId: null },
      });
      await prisma.organization.deleteMany({ where: { ownerId: userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    });

    it("control: a plain draft edit replaces the lines and answers 200", async () => {
      const id = await createDraft(9);
      const res = await put(id, {
        lineItems: [{ description: "Drying", quantity: 12, unitPrice: 10000 }],
      });
      expect(res.status).toBe(200);
      const row = await snapshot(id);
      expect(row!.status).toBe("DRAFT");
      expect(row!.lineItems.map((l) => l.quantity)).toEqual([12]);
      expect(row!.subtotalExGST).toBe(120000);
    });

    it("control: a plain draft header edit and a plain draft delete answer 200", async () => {
      const id = await createDraft(9);
      const edit = await put(id, { customerName: "Renamed While Draft" });
      expect(edit.status).toBe(200);
      expect((await snapshot(id))!.customerName).toBe("Renamed While Draft");

      const removed = await del(id);
      expect(removed.status).toBe(200);
      expect(await snapshot(id)).toBeNull();
    });

    it("control: an edit that starts after SENT is refused with 409", async () => {
      const id = await createDraft(9);
      await prisma.invoice.update({ where: { id }, data: { status: "SENT" } });
      const res = await put(id, {
        lineItems: [{ description: "Drying", quantity: 12, unitPrice: 10000 }],
      });
      expect(res.status).toBe(409);
      expect((await snapshot(id))!.lineItems.map((l) => l.quantity)).toEqual([9]);
    });

    it("RA-8273: a line-item edit that passed the DRAFT check, then lost the race to SENT, answers 409 and leaves the lines and totals unchanged", async () => {
      const id = await createDraft(9);
      const before = await snapshot(id);
      expect(before!.lineItems.map((l) => l.quantity)).toEqual([9]);
      expect(before!.subtotalExGST).toBe(90000);

      const res = await raceAgainstSent(id, () =>
        put(id, {
          lineItems: [{ description: "Drying", quantity: 12, unitPrice: 10000 }],
        }),
      );

      const after = await snapshot(id);
      expect(after!.status).toBe("SENT");
      expect(after!.lineItems.map((l) => l.quantity)).toEqual([9]);
      expect(after!.subtotalExGST).toBe(before!.subtotalExGST);
      expect(after!.gstAmount).toBe(before!.gstAmount);
      expect(after!.totalIncGST).toBe(before!.totalIncGST);
      expect(after!.amountDue).toBe(before!.amountDue);
      expect(res.status).toBe(409);
    });

    it("RA-8273: a header-only edit that lost the race to SENT answers 409 and changes nothing", async () => {
      const id = await createDraft(9);
      const res = await raceAgainstSent(id, () =>
        put(id, { customerName: "Changed After Sending" }),
      );
      const after = await snapshot(id);
      expect(after!.status).toBe("SENT");
      expect(after!.customerName).toBe("Synthetic Customer");
      expect(res.status).toBe(409);
    });

    it("RA-8273: a delete that passed the DRAFT check, then lost the race to SENT, answers 409 and the invoice survives", async () => {
      const id = await createDraft(9);
      const res = await raceAgainstSent(id, () => del(id));
      const after = await snapshot(id);
      expect(after).not.toBeNull();
      expect(after!.status).toBe("SENT");
      expect(after!.lineItems.map((l) => l.quantity)).toEqual([9]);
      expect(res.status).toBe(409);
    });
  },
);
