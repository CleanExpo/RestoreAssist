/**
 * RA-7721 review r2 — runFoundingTrialGrant end to end on a migrated Postgres.
 *
 * The unit suites model Prisma; this runs it, through the whole orchestration
 * (ABR check, Stripe checks, locked write transaction, add-ons + base plan):
 *   - an ABR-verified business gets every add-on free and a 60-day TRIAL;
 *   - a second transaction that swaps the ABN and fails the ABR lookup while
 *     the grant is running makes it write nothing. That transaction holds its
 *     row locks, uncommitted, before the grant starts and commits while the
 *     grant waits on them: only the grant's SELECT ... FOR UPDATE makes the
 *     grant see the change. Without it the grant reads the old committed ABN
 *     and commits the grant to a business ABR no longer confirms;
 *   - a longer trial is not shortened;
 *   - a firm paying for the base plan through Stripe keeps its row untouched.
 *
 * Runs only when DATABASE_URL is set (CI Unit Tests against a migrated
 * database, or locally against a migrated local Postgres).
 */
import { afterAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PRICING_CONFIG } from "@/lib/pricing";
import {
  COMPLIMENTARY_PRICE_ID,
  runFoundingTrialGrant,
  type BillingReader,
} from "../founding-trial-grant";

if (process.env.RELEASE_DB_PROFILE === "1" && !process.env.DATABASE_URL) {
  throw new Error("RELEASE_DB_PROFILE requires DATABASE_URL; founding trial may not skip");
}

const HAS_DB = !!process.env.DATABASE_URL;
const S = `ra7721r-${Date.now().toString(36)}`;
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-28T00:00:00.000Z");
const SIXTY = new Date(NOW.getTime() + 60 * DAY);

/** Stripe with no add-on billing anywhere. */
const noBilling = {
  checkout: { sessions: { list: () => (async function* () {})() } },
  subscriptions: { list: () => (async function* () {})() },
} as unknown as BillingReader;

let seq = 0;
/** A distinct 11-digit ABN per business (Organization.abn is unique). */
function abnFor(): string {
  seq += 1;
  const n = (Date.now() % 1_000_000_000) * 100 + seq;
  return `9${String(n).padStart(10, "0").slice(-10)}`;
}

const created: Array<{ ownerId: string; organizationId: string; workspaceId: string }> = [];

async function business(owner: Record<string, unknown> = {}) {
  const tag = `${S}-${created.length}`;
  const abn = abnFor();
  const u = await prisma.user.create({
    data: {
      email: `${tag}-owner@test.local`,
      role: "ADMIN",
      subscriptionStatus: "EXPIRED",
      trialEndsAt: new Date(NOW.getTime() - 13 * DAY),
      creditsRemaining: 0,
      ...owner,
    },
  });
  const org = await prisma.organization.create({
    data: { name: `${tag}-org`, ownerId: u.id, abn },
  });
  await prisma.hydrationJob.create({
    data: {
      organizationId: org.id,
      kind: "ABR",
      status: "READY",
      payload: { abn, status: "ACTIVE", legalName: `${tag} PTY LTD`, tradingNames: [] },
      completedAt: new Date(),
    },
  });
  const ws = await prisma.workspace.create({
    data: { name: `${tag}-ws`, slug: `${tag}-ws`, ownerId: u.id, status: "READY" },
  });
  const b = { ownerId: u.id, organizationId: org.id, workspaceId: ws.id, abn };
  created.push(b);
  return b;
}

const grant = (organizationId: string) =>
  runFoundingTrialGrant({
    db: prisma as unknown as PrismaClient,
    stripe: noBilling,
    organizationId,
    apply: true,
    now: NOW,
    sleep: async () => {},
  });

const ownerRow = (id: string) =>
  prisma.user.findUniqueOrThrow({
    where: { id },
    select: { subscriptionStatus: true, trialEndsAt: true, creditsRemaining: true, subscriptionId: true },
  });

describe.skipIf(!HAS_DB)("runFoundingTrialGrant on a real database (RA-7721 r2)", () => {
  afterAll(async () => {
    for (const b of created) {
      await prisma.featureEntitlement.deleteMany({ where: { workspaceId: b.workspaceId } }).catch(() => {});
      await prisma.workspace.delete({ where: { id: b.workspaceId } }).catch(() => {});
      await prisma.hydrationJob.deleteMany({ where: { organizationId: b.organizationId } }).catch(() => {});
      await prisma.organization.delete({ where: { id: b.organizationId } }).catch(() => {});
      await prisma.user.delete({ where: { id: b.ownerId } }).catch(() => {});
    }
  });

  it("an ABR-verified business gets every add-on free and the base plan to 60 days", async () => {
    const b = await business();
    const out = await grant(b.organizationId);
    expect(out.status).toBe("granted");
    const rows = await prisma.featureEntitlement.findMany({ where: { workspaceId: b.workspaceId } });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.active && r.stripePriceId === COMPLIMENTARY_PRICE_ID)).toBe(true);
    expect(await ownerRow(b.ownerId)).toEqual({
      subscriptionStatus: "TRIAL",
      trialEndsAt: SIXTY,
      creditsRemaining: PRICING_CONFIG.free.trialReportCredits,
      subscriptionId: null,
    });
  });

  /**
   * Run the grant while another connection holds `change` uncommitted, then
   * commit it once the grant has reached its write transaction.
   */
  async function grantDuring(
    change: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], orgId: string) => Promise<void>,
  ) {
    const b = await business();
    const before = await ownerRow(b.ownerId);
    let releaseWriter!: () => void;
    const writerMayCommit = new Promise<void>((r) => (releaseWriter = r));
    let writerLocked!: () => void;
    const writerHoldsLocks = new Promise<void>((r) => (writerLocked = r));
    const writer = prisma.$transaction(
      async (tx) => {
        await change(tx, b.organizationId);
        writerLocked();
        await writerMayCommit;
      },
      { timeout: 20_000 },
    );
    await writerHoldsLocks;
    let settled = false;
    const running = grant(b.organizationId).finally(() => (settled = true));
    // Commit the writer only once the grant's backend is actually waiting on
    // a row lock (review r3 P2: a fixed delay could pass with the two running
    // one after the other). If the grant finishes without ever waiting, which
    // is what happens when it takes no lock, stop polling and let the
    // assertions below judge it.
    const waitedOnLock = await (async () => {
      const deadline = Date.now() + 10_000;
      while (!settled && Date.now() < deadline) {
        const [{ n }] = await prisma.$queryRaw<Array<{ n: number }>>`
          SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE datname = current_database()
            AND wait_event_type = 'Lock'
            AND query LIKE '%FOR UPDATE%'`;
        if (n > 0) return true;
        await new Promise((r) => setTimeout(r, 25));
      }
      return false;
    })();
    releaseWriter();
    await writer;
    const out = await running;
    return { b, before, out, waitedOnLock };
  }

  const swapAbn = (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], orgId: string) =>
    tx.organization.update({ where: { id: orgId }, data: { abn: abnFor() } }).then(() => {});
  const failLookup = (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], orgId: string) =>
    tx.hydrationJob
      .update({
        where: { organizationId_kind: { organizationId: orgId, kind: "ABR" } },
        data: { status: "ERROR", errorMessage: "UPSTREAM_ERROR" },
      })
      .then(() => {});

  for (const [name, change] of [
    ["ABN swapped and ABR lookup failed", async (tx: never, id: string) => { await swapAbn(tx, id); await failLookup(tx, id); }],
    ["ABN swapped (organisation row only)", swapAbn],
    ["ABR lookup failed (lookup row only)", failLookup],
  ] as const) {
    it(`a concurrent transaction commits "${name}" during the grant: nothing is written`, async () => {
      const { b, before, out, waitedOnLock } = await grantDuring(change as never);
      expect(waitedOnLock).toBe(true);
      expect(out.status).toBe("unverified_abn");
      expect(await prisma.featureEntitlement.count({ where: { workspaceId: b.workspaceId } })).toBe(0);
      expect(await ownerRow(b.ownerId)).toEqual(before);
    }, 30_000);
  }

  it("P1-PREVIEW-IDENTITY-NOT-BOUND: re-verified as another business between Preview and Apply — Apply writes nothing", async () => {
    const b = await business();
    const before = await ownerRow(b.ownerId);
    const preview = await runFoundingTrialGrant({
      db: prisma as unknown as PrismaClient,
      stripe: noBilling,
      organizationId: b.organizationId,
      apply: false,
      now: NOW,
    });
    if (preview.status !== "dry_run") throw new Error(`preview was ${preview.status}`);
    const confirmed = {
      organizationId: b.organizationId,
      abn: preview.entity.abn,
      legalName: preview.entity.legalName,
    };
    // setup/hydrate completes again for a different, ABR-confirmed business.
    const other = abnFor();
    await prisma.organization.update({ where: { id: b.organizationId }, data: { abn: other } });
    await prisma.hydrationJob.update({
      where: { organizationId_kind: { organizationId: b.organizationId, kind: "ABR" } },
      data: { payload: { abn: other, status: "ACTIVE", legalName: "OTHER PTY LTD", tradingNames: [] } },
    });
    const out = await runFoundingTrialGrant({
      db: prisma as unknown as PrismaClient,
      stripe: noBilling,
      organizationId: b.organizationId,
      apply: true,
      confirmed,
      now: NOW,
      sleep: async () => {},
    });
    expect(out.status).toBe("identity_changed");
    expect(await prisma.featureEntitlement.count({ where: { workspaceId: b.workspaceId } })).toBe(0);
    expect(await ownerRow(b.ownerId)).toEqual(before);
  });

  it("a trial already running past 60 days is not shortened", async () => {
    const longer = new Date(NOW.getTime() + 90 * DAY);
    const b = await business({ subscriptionStatus: "TRIAL", trialEndsAt: longer, creditsRemaining: 7 });
    const out = await grant(b.organizationId);
    expect(out).toMatchObject({ status: "granted", basePlan: { outcome: "kept_longer" } });
    expect(await ownerRow(b.ownerId)).toMatchObject({ trialEndsAt: longer, creditsRemaining: 7 });
  });

  it("a firm paying for the base plan through Stripe keeps its row exactly as it was", async () => {
    const b = await business({
      subscriptionStatus: "ACTIVE",
      subscriptionId: `${S}-base-sub`,
      trialEndsAt: null,
      creditsRemaining: 12,
    });
    const before = await ownerRow(b.ownerId);
    const out = await grant(b.organizationId);
    expect(out).toMatchObject({ status: "granted", basePlan: { outcome: "skipped_paying" } });
    expect(await ownerRow(b.ownerId)).toEqual(before);
  });
});
