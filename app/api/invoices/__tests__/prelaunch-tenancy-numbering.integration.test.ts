/**
 * Prelaunch audit D-021, D-022, D-025 — real-database proof on the invoice
 * routes.
 *
 * D-021  POST /api/invoices stored any body clientId / reportId / estimateId,
 *        and GET /api/invoices/[id] then returned the other business's client
 *        name and email or report title. Linking now requires the reach a
 *        direct read would need.
 * D-022  Invoice numbers come from a per-user sequence, but the number was
 *        unique across the platform, so a second business got 409 on every
 *        attempt. Two businesses must each be able to hold RA-{year}-0001.
 * D-025  Two concurrent line-item edits each deleted only the lines they
 *        could see; both inserts survived and the stored totals matched one
 *        edit. The PUT now locks the invoice row first.
 *
 * The D-025 case holds an edit open in T0 (row lock, lines replaced, not yet
 * committed), fires the PUT, waits until pg_stat_activity shows the PUT
 * blocked, then commits T0. With the lock the PUT waits at its first
 * statement and then replaces T0's committed lines. Without it the PUT's
 * DELETE only waits on the old lines, cannot see T0's new ones, and both
 * sets remain.
 *
 * Runs only when DATABASE_URL is set (`npm run test:db`). Session is mocked;
 * Prisma is real.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { prisma } from "@/lib/prisma";
import { POST } from "../route";
import { GET, PUT } from "../[id]/route";
import { POST as POST_RECURRING } from "../recurring/route";

const S = `prelaunch-inv-${Date.now().toString(36)}`;
const YEAR = new Date().getFullYear();
const ids = { a: "", b: "", bClient: "", bReport: "", bEstimate: "", aClient: "" };

const LOCK_WAIT_POLL_MS = 25;
const LOCK_WAIT_DEADLINE_MS = 4_000;

function as(userId: string) {
  getServerSession.mockResolvedValue({ user: { id: userId } });
}

function postInvoice(body: Record<string, unknown>) {
  return POST(
    new NextRequest("http://localhost/api/invoices", {
      method: "POST",
      body: JSON.stringify({
        customerName: "Synthetic Customer",
        customerEmail: "synthetic@example.test",
        dueDate: new Date(Date.now() + 864e5).toISOString(),
        lineItems: [{ description: "Drying", quantity: 1, unitPrice: 10000 }],
        ...body,
      }),
      headers: { "content-type": "application/json" },
    }),
  );
}

async function waitForInvoiceLockWaiter(t0Pid: number): Promise<number> {
  const started = Date.now();
  while (true) {
    const waiters = await prisma.$queryRaw<Array<{ pid: number | bigint }>>(
      Prisma.sql`
        SELECT pid FROM pg_stat_activity
        WHERE pid <> ${t0Pid}
          AND wait_event_type = 'Lock'
          AND (query ILIKE '%"Invoice"%' OR query ILIKE '%"InvoiceLineItem"%')
        LIMIT 1
      `,
    );
    if (waiters.length > 0) return Date.now() - started;
    if (Date.now() - started >= LOCK_WAIT_DEADLINE_MS) {
      throw new Error(
        `D-025: no Lock waiter on Invoice/InvoiceLineItem within ${LOCK_WAIT_DEADLINE_MS}ms`,
      );
    }
    await new Promise((r) => setTimeout(r, LOCK_WAIT_POLL_MS));
  }
}

describe.skipIf(!process.env.DATABASE_URL)(
  "invoice routes: prelaunch D-021 / D-022 / D-025",
  () => {
    beforeAll(async () => {
      const a = await prisma.user.create({
        data: { email: `${S}-a@test.local`, role: "ADMIN", subscriptionStatus: "TRIAL" },
      });
      const b = await prisma.user.create({
        data: { email: `${S}-b@test.local`, role: "ADMIN", subscriptionStatus: "TRIAL" },
      });
      ids.a = a.id;
      ids.b = b.id;
      // Two separate businesses, each with an AU locale so invoicing is allowed.
      for (const u of [a, b]) {
        const org = await prisma.organization.create({
          data: { name: `${S} ${u.id}`, ownerId: u.id, country: "AU" },
        });
        await prisma.user.update({ where: { id: u.id }, data: { organizationId: org.id } });
      }
      ids.aClient = (
        await prisma.client.create({
          data: { name: "A Own Client", email: `${S}-ac@example.test`, userId: a.id },
        })
      ).id;
      ids.bClient = (
        await prisma.client.create({
          data: { name: "B Secret Client", email: `${S}-bc@example.test`, userId: b.id },
        })
      ).id;
      const bReport = await prisma.report.create({
        data: {
          title: "B Secret Report",
          clientName: "B Secret Client",
          propertyAddress: "2 Other St",
          hazardType: "Water",
          insuranceType: "Building",
          userId: b.id,
        },
      });
      ids.bReport = bReport.id;
      ids.bEstimate = (
        await prisma.estimate.create({
          data: { reportId: bReport.id, userId: b.id, createdBy: b.id, updatedBy: b.id },
        })
      ).id;
    });

    afterAll(async () => {
      const users = [ids.a, ids.b].filter(Boolean);
      await prisma.recurringInvoice.deleteMany({ where: { userId: { in: users } } });
      await prisma.invoice.deleteMany({ where: { userId: { in: users } } });
      await prisma.invoiceSequence.deleteMany({ where: { userId: { in: users } } });
      await prisma.estimate.deleteMany({ where: { userId: { in: users } } });
      await prisma.report.deleteMany({ where: { userId: { in: users } } });
      await prisma.client.deleteMany({ where: { userId: { in: users } } });
      await prisma.user.updateMany({ where: { id: { in: users } }, data: { organizationId: null } });
      await prisma.organization.deleteMany({ where: { ownerId: { in: users } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    });

    it("D-021: refuses another business's client, report and estimate, and stores nothing", async () => {
      as(ids.a);
      for (const body of [
        { clientId: ids.bClient },
        { reportId: ids.bReport },
        { estimateId: ids.bEstimate },
      ]) {
        const res = await postInvoice(body);
        expect(res.status, JSON.stringify(body)).toBe(404);
      }
      const linked = await prisma.invoice.count({
        where: {
          userId: ids.a,
          OR: [
            { clientId: ids.bClient },
            { reportId: ids.bReport },
            { estimateId: ids.bEstimate },
          ],
        },
      });
      expect(linked).toBe(0);
    });

    it("D-021: recurring invoice template refuses another business's client", async () => {
      as(ids.a);
      const res = await POST_RECURRING(
        new NextRequest("http://localhost/api/invoices/recurring", {
          method: "POST",
          body: JSON.stringify({
            templateName: "Monthly",
            clientId: ids.bClient,
            customerName: "Synthetic Customer",
            customerEmail: "synthetic@example.test",
            frequency: "MONTHLY",
            startDate: new Date().toISOString(),
            lineItems: [{ description: "Monitoring", quantity: 1, unitPrice: 1000 }],
          }),
          headers: { "content-type": "application/json" },
        }),
      );
      expect(res.status).toBe(404);
      expect(
        await prisma.recurringInvoice.count({ where: { userId: ids.a, clientId: ids.bClient } }),
      ).toBe(0);
    });

    it("D-021: still links the caller's own client", async () => {
      as(ids.a);
      const res = await postInvoice({ clientId: ids.aClient });
      expect(res.status).toBe(201);
      const { invoice } = await res.json();
      const read = await GET(new NextRequest(`http://localhost/api/invoices/${invoice.id}`), {
        params: Promise.resolve({ id: invoice.id }),
      });
      expect(read.status).toBe(200);
      expect(JSON.stringify(await read.json())).toContain("A Own Client");
    });

    it("D-022: a second business can create invoices in the same year", async () => {
      as(ids.b);
      const first = await postInvoice({});
      expect(first.status).toBe(201);
      const second = await postInvoice({});
      expect(second.status).toBe(201);
      const numbers = [
        (await first.json()).invoice.invoiceNumber,
        (await second.json()).invoice.invoiceNumber,
      ];
      expect(numbers).toEqual([`RA-${YEAR}-0001`, `RA-${YEAR}-0002`]);
      // Business A already holds RA-{year}-0001 from the test above.
      const shared = await prisma.invoice.count({
        where: { invoiceNumber: `RA-${YEAR}-0001`, userId: { in: [ids.a, ids.b] } },
      });
      expect(shared).toBe(2);
    });

    it("D-025: a PUT that overlaps another edit leaves stored totals equal to the stored lines", async () => {
      as(ids.a);
      const created = await postInvoice({});
      expect(created.status).toBe(201);
      const invoiceId: string = (await created.json()).invoice.id;

      let pending: Promise<Response> | undefined;
      await prisma.$transaction(
        async (tx) => {
          // T0: another edit in flight, holding the row and replacing lines.
          await tx.$queryRaw(
            Prisma.sql`SELECT "id" FROM "Invoice" WHERE "id" = ${invoiceId} FOR UPDATE`,
          );
          await tx.invoiceLineItem.deleteMany({ where: { invoiceId } });
          await tx.invoiceLineItem.createMany({
            data: [0, 1].map((i) => ({
              invoiceId,
              description: `T0 line ${i}`,
              quantity: 1,
              unitPrice: 5000,
              subtotal: 5000,
              gstRate: 10,
              gstAmount: 500,
              total: 5500,
              sortOrder: i,
            })),
          });
          await tx.invoice.update({
            where: { id: invoiceId },
            data: { subtotalExGST: 10000, gstAmount: 1000, totalIncGST: 11000, amountDue: 11000 },
          });
          const pid = Number(
            (await tx.$queryRaw<Array<{ pid: number }>>(Prisma.sql`SELECT pg_backend_pid() AS pid`))[0].pid,
          );

          pending = PUT(
            new NextRequest(`http://localhost/api/invoices/${invoiceId}`, {
              method: "PUT",
              body: JSON.stringify({
                lineItems: [{ description: "PUT line", quantity: 1, unitPrice: 30000 }],
              }),
              headers: { "content-type": "application/json" },
            }),
            { params: Promise.resolve({ id: invoiceId }) },
          );
          const waitedMs = await waitForInvoiceLockWaiter(pid);
          console.log(`[D-025] PUT observed waiting on a lock after ${waitedMs}ms`);
        },
        { timeout: 15_000 },
      );

      const res = await pending!;
      expect(res.status).toBe(200);

      const row = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        select: {
          subtotalExGST: true,
          lineItems: { select: { description: true, subtotal: true } },
        },
      });
      const lineSum = row!.lineItems.reduce((s, l) => s + l.subtotal, 0);
      expect(row!.lineItems.map((l) => l.description)).toEqual(["PUT line"]);
      expect(lineSum).toBe(row!.subtotalExGST);
    });
  },
);
