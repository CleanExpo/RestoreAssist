/**
 * RA-7721 — real-database proof that a Founding Trial grant stays free.
 *
 * The unit tests model Prisma's behaviour; this one runs it. It proves, on a
 * migrated Postgres, the two things the fix depends on:
 *   - the grant writes only rows no Stripe subscription backs, inside a
 *     transaction, and a paid row neither aborts it nor gets overwritten;
 *   - a Stripe subscription event (checkout completing after the grant,
 *     cancellation) leaves a complimentary row exactly as it was, while an
 *     event for a paid row is still applied.
 *
 * Runs only when DATABASE_URL is set (CI Unit Tests against a migrated
 * database, or `npm run test:db -- lib/billing`).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import {
  COMPLIMENTARY_PRICE_ID,
  FOUNDING_TRIAL_SEATS,
  grantFoundingTrial,
} from "../founding-trial-grant";
import { applyRecurringAddonSubscription } from "../fulfill-recurring-addon";

if (process.env.RELEASE_DB_PROFILE === "1" && !process.env.DATABASE_URL) {
  throw new Error("RELEASE_DB_PROFILE requires DATABASE_URL; founding trial may not skip");
}

const HAS_DB = !!process.env.DATABASE_URL;
const S = `ra7721-${Date.now().toString(36)}`;
let ownerId = "";
let organizationId = "";
let workspaceId = "";

function event(
  type: string,
  status: Stripe.Subscription.Status,
  quantity = 1,
): Stripe.Subscription {
  return {
    id: `${S}-sub`,
    status,
    metadata: { type, workspaceId, userId: ownerId },
    items: { data: [{ price: { id: `${S}-price` }, quantity }] },
  } as unknown as Stripe.Subscription;
}

const row = (sku: "TECHNICIAN_SEATS" | "VOICE" | "BOOKKEEPING") =>
  prisma.featureEntitlement.findUnique({
    where: { workspaceId_sku: { workspaceId, sku } },
    select: { active: true, seats: true, stripeSubscriptionId: true, stripePriceId: true },
  });

describe.skipIf(!HAS_DB)("Founding Trial grant on a real database (RA-7721)", () => {
  beforeAll(async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const owner = await prisma.user.create({
      data: { email: `${S}-owner@test.local`, role: "ADMIN" },
    });
    ownerId = owner.id;
    const org = await prisma.organization.create({
      data: { name: `${S}-org`, ownerId },
    });
    organizationId = org.id;
    const ws = await prisma.workspace.create({
      data: { name: `${S}-ws`, slug: `${S}-ws`, ownerId, status: "READY" },
    });
    workspaceId = ws.id;
    // VOICE is already paid for through Stripe before the trial grant.
    await prisma.featureEntitlement.create({
      data: {
        workspaceId,
        sku: "VOICE",
        active: true,
        stripeSubscriptionId: `${S}-voice-sub`,
        stripePriceId: `${S}-voice-price`,
      },
    });
  });

  afterAll(async () => {
    if (workspaceId) {
      await prisma.featureEntitlement.deleteMany({ where: { workspaceId } }).catch(() => {});
      await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    }
    if (organizationId) {
      await prisma.organization.delete({ where: { id: organizationId } }).catch(() => {});
    }
    if (ownerId) await prisma.user.delete({ where: { id: ownerId } }).catch(() => {});
  });

  it("grants every unpaid add-on free in one transaction and leaves the paid one alone", async () => {
    const res = await prisma.$transaction((tx) =>
      grantFoundingTrial(tx, organizationId, { apply: true }),
    );
    expect(res.workspaceId).toBe(workspaceId);
    expect(res.skippedPaid).toEqual(["VOICE"]);
    expect(res.granted).toContain("TECHNICIAN_SEATS");

    expect(await row("TECHNICIAN_SEATS")).toEqual({
      active: true,
      seats: FOUNDING_TRIAL_SEATS,
      stripeSubscriptionId: null,
      stripePriceId: COMPLIMENTARY_PRICE_ID,
    });
    expect(await row("VOICE")).toEqual({
      active: true,
      seats: null,
      stripeSubscriptionId: `${S}-voice-sub`,
      stripePriceId: `${S}-voice-price`,
    });
  });

  it("a seat checkout completing after the grant does not replace the free seats", async () => {
    const before = await row("TECHNICIAN_SEATS");
    await applyRecurringAddonSubscription(event("technician_seats_addon", "active", 1));
    expect(await row("TECHNICIAN_SEATS")).toEqual(before);
  });

  it("cancelling that subscription does not switch the free seats off", async () => {
    const before = await row("TECHNICIAN_SEATS");
    await applyRecurringAddonSubscription(event("technician_seats_addon", "canceled", 1));
    expect(await row("TECHNICIAN_SEATS")).toEqual(before);
  });

  it("an event for a paid add-on is still applied", async () => {
    await applyRecurringAddonSubscription({
      ...event("voice_addon", "canceled"),
      id: `${S}-voice-sub`,
    } as Stripe.Subscription);
    expect(await row("VOICE")).toMatchObject({ active: false });
  });
});
