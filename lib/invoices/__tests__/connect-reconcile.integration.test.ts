/**
 * P1-MNY-01 C8 — real-database proof for Stripe Connect invoice payments.
 *
 * On a migrated Postgres (npm run test:db) this proves:
 *   - the four Workspace Connect columns exist, default off, and the account id
 *     is unique (one Stripe account can never belong to two firms);
 *   - a payment_intent.succeeded from the wrong connected account leaves the
 *     invoice unpaid and leaves an audit row, inside a committed transaction;
 *   - the right account marks it PAID with exactly one InvoicePayment, and a
 *     replay of the same event adds no second payment.
 *
 * Runs only when DATABASE_URL is set.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

vi.mock("@/lib/lifecycle/subscribers/invoice-paid", () => ({
  onInvoicePaid: vi.fn().mockResolvedValue({ ok: true }),
}));

import { prisma } from "@/lib/prisma";
import { reconcileInvoicePaymentIntent } from "../reconcile-stripe-payment-intent";

if (process.env.RELEASE_DB_PROFILE === "1" && !process.env.DATABASE_URL) {
  throw new Error("RELEASE_DB_PROFILE requires DATABASE_URL; connect reconcile may not skip");
}

const HAS_DB = !!process.env.DATABASE_URL;
const S = `p1mny01-${Date.now().toString(36)}`;
const ACCT_A = `acct_${S}_A`;
const ACCT_B = `acct_${S}_B`;
let ownerId = "";
let workspaceId = "";
let otherWorkspaceId = "";
let invoiceId = "";

function piEvent(account: string, eventId: string): {
  event: Stripe.Event;
  pi: Stripe.PaymentIntent;
} {
  const pi = {
    id: `pi_${S}`,
    object: "payment_intent",
    status: "succeeded",
    amount_received: 11_000,
    currency: "aud",
    latest_charge: `ch_${S}`,
    created: 1_786_250_000,
    metadata: {
      type: "invoice",
      invoiceId,
      invoiceNumber: `${S}-INV`,
      userId: ownerId,
      workspaceId,
    },
  } as unknown as Stripe.PaymentIntent;
  const event = {
    id: eventId,
    type: "payment_intent.succeeded",
    account,
    data: { object: pi },
  } as unknown as Stripe.Event;
  return { event, pi };
}

describe.skipIf(!HAS_DB)("Stripe Connect invoice reconcile on a real database (P1-MNY-01)", () => {
  beforeAll(async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const owner = await prisma.user.create({
      data: { email: `${S}-owner@test.local`, role: "ADMIN" },
    });
    ownerId = owner.id;
    const ws = await prisma.workspace.create({
      data: { name: `${S}-ws`, slug: `${S}-ws`, ownerId, status: "READY" },
    });
    workspaceId = ws.id;
    const other = await prisma.workspace.create({
      data: { name: `${S}-ws2`, slug: `${S}-ws2`, ownerId, status: "READY" },
    });
    otherWorkspaceId = other.id;
    const inv = await prisma.invoice.create({
      data: {
        invoiceNumber: `${S}-INV`,
        status: "SENT",
        dueDate: new Date(Date.now() + 7 * 86_400_000),
        customerName: "Fixture Customer",
        customerEmail: `${S}-customer@test.local`,
        subtotalExGST: 10_000,
        gstAmount: 1_000,
        totalIncGST: 11_000,
        amountPaid: 0,
        amountDue: 11_000,
        currency: "AUD",
        userId: ownerId,
        workspaceId,
      },
    });
    invoiceId = inv.id;
  });

  afterAll(async () => {
    if (invoiceId) {
      await prisma.invoicePaymentAllocation.deleteMany({ where: { invoiceId } }).catch(() => {});
      await prisma.invoicePayment.deleteMany({ where: { invoiceId } }).catch(() => {});
      await prisma.invoiceAuditLog.deleteMany({ where: { invoiceId } }).catch(() => {});
      await prisma.invoice.delete({ where: { id: invoiceId } }).catch(() => {});
    }
    for (const id of [workspaceId, otherWorkspaceId]) {
      if (id) await prisma.workspace.delete({ where: { id } }).catch(() => {});
    }
    if (ownerId) await prisma.user.delete({ where: { id: ownerId } }).catch(() => {});
  });

  it("adds the four Connect columns, off by default", async () => {
    const ws = await prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: {
        stripeConnectAccountId: true,
        stripeConnectChargesEnabled: true,
        stripeConnectDetailsSubmitted: true,
        stripeConnectStatusAt: true,
      },
    });
    expect(ws).toEqual({
      stripeConnectAccountId: null,
      stripeConnectChargesEnabled: false,
      stripeConnectDetailsSubmitted: false,
      stripeConnectStatusAt: null,
    });
  });

  it("allows one Stripe account per workspace only", async () => {
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        stripeConnectAccountId: ACCT_A,
        stripeConnectChargesEnabled: true,
        stripeConnectDetailsSubmitted: true,
        stripeConnectStatusAt: new Date(),
      },
    });
    await expect(
      prisma.workspace.update({
        where: { id: otherWorkspaceId },
        data: { stripeConnectAccountId: ACCT_A },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("a payment from the wrong account leaves the invoice unpaid and audited", async () => {
    const { event, pi } = piEvent(ACCT_B, `evt_${S}_B`);
    const r = await reconcileInvoicePaymentIntent(event, pi, {
      connectedAccountId: ACCT_B,
    });
    expect(r.kind).toBe("account-mismatch");

    const inv = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      select: { status: true, amountPaid: true, amountDue: true },
    });
    expect(inv).toEqual({ status: "SENT", amountPaid: 0, amountDue: 11_000 });
    expect(await prisma.invoicePayment.count({ where: { invoiceId } })).toBe(0);
    const audits = await prisma.invoiceAuditLog.findMany({
      where: { invoiceId, action: "stripe_connect_account_mismatch" },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].metadata).toMatchObject({
      eventAccount: ACCT_B,
      expectedAccount: ACCT_A,
    });
  });

  it("the right account marks it PAID with exactly one payment, and a replay adds none", async () => {
    const { event, pi } = piEvent(ACCT_A, `evt_${S}_A`);
    const r = await reconcileInvoicePaymentIntent(event, pi, {
      connectedAccountId: ACCT_A,
    });
    expect(r.kind).toBe("recorded");
    const again = await reconcileInvoicePaymentIntent(event, pi, {
      connectedAccountId: ACCT_A,
    });
    expect(again.kind).toBe("already-recorded");

    const inv = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      select: { status: true, amountPaid: true, amountDue: true },
    });
    expect(inv).toEqual({ status: "PAID", amountPaid: 11_000, amountDue: 0 });
    const payments = await prisma.invoicePayment.findMany({ where: { invoiceId } });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      amount: 11_000,
      paymentMethod: "STRIPE",
      stripePaymentIntentId: `pi_${S}`,
    });
  });
});
