/**
 * foundingTrialCurrentState: what a business holds now, read before any check
 * that can stop a Preview (29/11/2026, DRC (NSW) Pty Ltd previewed as "Not
 * granted" after a founder-override grant).
 *
 * The double answers each Prisma call from fixed rows, filtering on the
 * arguments the reader passes, so a reader that asked for the wrong owner,
 * workspace or business would read nothing and fail these assertions.
 */
import { AddonSku } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  ABN_OVERRIDE_EVENT,
  ABN_OVERRIDE_REVERTED_EVENT,
  COMPLIMENTARY_PRICE_ID,
  FoundingTrialGrantError,
  foundingTrialCurrentState,
} from "../founding-trial-grant";

type Row = {
  workspaceId: string;
  sku: AddonSku;
  active: boolean;
  stripePriceId: string | null;
  stripeSubscriptionId: string | null;
};
type Event = { userId: string; eventType: string; payload: unknown; createdAt: Date };

const ORG = "org_drc";
const OWNER = "user_owner";
const WS = "ws_grant";
const TRIAL_END = new Date("2027-01-28T03:00:00.000Z");

function fakeDb(opts: {
  rows?: Row[];
  events?: Event[];
  owner?: {
    subscriptionStatus: string | null;
    trialEndsAt: Date | null;
    lifetimeAccess?: boolean | null;
  } | null;
  workspace?: string | null;
  writes?: string[];
}) {
  const rows = opts.rows ?? [];
  const events = opts.events ?? [];
  const write = (name: string) => () => {
    opts.writes?.push(name);
    throw new Error(`write ${name} called on a read-only path`);
  };
  return {
    organization: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === ORG ? { ownerId: OWNER } : null,
    },
    workspace: {
      findFirst: async ({ where }: { where: { ownerId: string; status: string } }) =>
        where.ownerId === OWNER && where.status === "READY" && opts.workspace !== null
          ? { id: opts.workspace ?? WS }
          : null,
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === OWNER ? (opts.owner === undefined ? null : opts.owner) : null,
      updateMany: write("user.updateMany"),
    },
    featureEntitlement: {
      findMany: async ({ where }: { where: { workspaceId: string; active?: boolean } }) =>
        rows.filter(
          (r) =>
            r.workspaceId === where.workspaceId &&
            (where.active === undefined || r.active === where.active),
        ),
      updateMany: write("featureEntitlement.updateMany"),
      createMany: write("featureEntitlement.createMany"),
      deleteMany: write("featureEntitlement.deleteMany"),
    },
    subscriptionEvent: {
      // Honours the reader's payload filter, sort direction and limit the way
      // Postgres does, so a reader that drops the organisation filter, reads
      // newest first, or caps the list gets exactly what it asked for.
      findMany: async ({
        where,
        orderBy,
        take,
      }: {
        where: {
          userId: string;
          eventType: { in: string[] };
          payload?: { path: string[]; equals: string };
        };
        orderBy?: { createdAt?: "asc" | "desc" } | Array<{ createdAt?: "asc" | "desc" }>;
        take?: number;
      }) => {
        const first = Array.isArray(orderBy) ? orderBy[0] : orderBy;
        const dir = first?.createdAt === "desc" ? -1 : 1;
        const out = events
          .filter(
            (e) =>
              e.userId === where.userId &&
              where.eventType.in.includes(e.eventType) &&
              (!where.payload ||
                (e.payload as Record<string, unknown> | null)?.[where.payload.path[0]] ===
                  where.payload.equals),
          )
          .sort((a, b) => dir * (a.createdAt.getTime() - b.createdAt.getTime()));
        return take === undefined ? out : out.slice(0, take);
      },
      create: write("subscriptionEvent.create"),
    },
  } as never;
}

const grantRow = (sku: AddonSku): Row => ({
  workspaceId: WS,
  sku,
  active: true,
  stripePriceId: COMPLIMENTARY_PRICE_ID,
  stripeSubscriptionId: null,
});

const overrideEvent = (at: string, organizationId = ORG): Event => ({
  userId: OWNER,
  eventType: ABN_OVERRIDE_EVENT,
  payload: { organizationId, reason: "Founder approved." },
  createdAt: new Date(at),
});

describe("foundingTrialCurrentState", () => {
  it("a granted business on a founder override: every add-on free, the trial end, the override", async () => {
    const writes: string[] = [];
    const db = fakeDb({
      rows: Object.values(AddonSku).map(grantRow),
      owner: { subscriptionStatus: "TRIAL", trialEndsAt: TRIAL_END },
      events: [overrideEvent("2026-11-29T01:00:00.000Z")],
      writes,
    });
    const state = await foundingTrialCurrentState(db, ORG);
    expect(state.workspaceId).toBe(WS);
    expect(state.foundingTrialAddons).toHaveLength(Object.values(AddonSku).length);
    expect(state.foundingTrialAddons).toHaveLength(9);
    expect(state.activeAddons).toHaveLength(9);
    expect(state.paidAddons).toEqual([]);
    expect(state.owner).toEqual({
      subscriptionStatus: "TRIAL",
      trialEndsAt: TRIAL_END,
      lifetimeAccess: false,
    });
    expect(state.founderOverride).toEqual({ recordedAt: new Date("2026-11-29T01:00:00.000Z") });
    expect(writes).toEqual([]);
  });

  it("a never-granted business reads as holding nothing free, with no override", async () => {
    const state = await foundingTrialCurrentState(
      fakeDb({ owner: { subscriptionStatus: "EXPIRED", trialEndsAt: new Date("2026-10-01") } }),
      ORG,
    );
    expect(state.foundingTrialAddons).toEqual([]);
    expect(state.activeAddons).toEqual([]);
    expect(state.founderOverride).toBeNull();
    expect(state.owner?.subscriptionStatus).toBe("EXPIRED");
  });

  it("separates add-ons a Stripe subscription pays for, and ignores inactive rows", async () => {
    const state = await foundingTrialCurrentState(
      fakeDb({
        owner: { subscriptionStatus: "TRIAL", trialEndsAt: TRIAL_END },
        rows: [
          grantRow(AddonSku.VOICE),
          {
            workspaceId: WS,
            sku: AddonSku.PAYMENTS,
            active: true,
            stripePriceId: "price_live",
            stripeSubscriptionId: "sub_paid",
          },
          { ...grantRow(AddonSku.BOOKKEEPING), active: false },
          // Another workspace's grant is not this business's.
          { ...grantRow(AddonSku.AI_COPILOT), workspaceId: "ws_other" },
        ],
      }),
      ORG,
    );
    expect(state.foundingTrialAddons).toEqual([AddonSku.VOICE]);
    expect(state.paidAddons).toEqual([AddonSku.PAYMENTS]);
    expect(state.activeAddons).toEqual([AddonSku.VOICE, AddonSku.PAYMENTS]);
  });

  it("an override that was put back afterwards is not reported as recorded", async () => {
    const state = await foundingTrialCurrentState(
      fakeDb({
        owner: null,
        events: [
          overrideEvent("2026-11-29T01:00:00.000Z"),
          {
            userId: OWNER,
            eventType: ABN_OVERRIDE_REVERTED_EVENT,
            payload: { organizationId: ORG },
            createdAt: new Date("2026-11-29T01:05:00.000Z"),
          },
        ],
      }),
      ORG,
    );
    expect(state.founderOverride).toBeNull();
    expect(state.owner).toBeNull();
  });

  it("an override recorded for another business the same owner holds does not count", async () => {
    const state = await foundingTrialCurrentState(
      fakeDb({ events: [overrideEvent("2026-11-29T01:00:00.000Z", "org_other")] }),
      ORG,
    );
    expect(state.founderOverride).toBeNull();
  });

  it("review D1: the put-back of a repeat override leaves the earlier override that still stands", async () => {
    const revert = (at: string): Event => ({
      userId: OWNER,
      eventType: ABN_OVERRIDE_REVERTED_EVENT,
      payload: { organizationId: ORG },
      createdAt: new Date(at),
    });
    const state = await foundingTrialCurrentState(
      fakeDb({
        events: [
          overrideEvent("2026-11-29T01:00:00.000Z"),
          overrideEvent("2026-11-29T02:00:00.000Z"),
          revert("2026-11-29T02:05:00.000Z"),
        ],
      }),
      ORG,
    );
    expect(state.founderOverride).toEqual({ recordedAt: new Date("2026-11-29T01:00:00.000Z") });
  });

  it("review D2: sixty newer events for the owner's other businesses cannot hide this business's override", async () => {
    const others: Event[] = Array.from({ length: 60 }, (_, i) => ({
      userId: OWNER,
      eventType: ABN_OVERRIDE_REVERTED_EVENT,
      payload: { organizationId: `org_other_${i}` },
      createdAt: new Date(Date.UTC(2026, 10, 29, 3, i)),
    }));
    const state = await foundingTrialCurrentState(
      fakeDb({ events: [overrideEvent("2026-11-29T01:00:00.000Z"), ...others] }),
      ORG,
    );
    expect(state.founderOverride).toEqual({ recordedAt: new Date("2026-11-29T01:00:00.000Z") });
  });

  it("review D4: reports lifetime access, which is stored as ACTIVE", async () => {
    const state = await foundingTrialCurrentState(
      fakeDb({ owner: { subscriptionStatus: "ACTIVE", trialEndsAt: null, lifetimeAccess: true } }),
      ORG,
    );
    expect(state.owner).toEqual({ subscriptionStatus: "ACTIVE", trialEndsAt: null, lifetimeAccess: true });
  });

  it("an owner with no READY workspace reads no add-ons instead of failing the Preview", async () => {
    const state = await foundingTrialCurrentState(
      fakeDb({ workspace: null, rows: [grantRow(AddonSku.VOICE)] }),
      ORG,
    );
    expect(state.workspaceId).toBeNull();
    expect(state.activeAddons).toEqual([]);
  });

  it("an unknown organisation throws rather than reading as an empty state", async () => {
    await expect(foundingTrialCurrentState(fakeDb({}), "org_missing")).rejects.toBeInstanceOf(
      FoundingTrialGrantError,
    );
  });
});
