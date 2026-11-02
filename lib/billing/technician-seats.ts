/**
 * J-09 / D-006 — Field Technician Seat enforcement.
 *
 * Founder ruling (26/09/2026): the $99 base plan includes 0 technician seats.
 * Every technician (role USER, labelled "Technician" in the invite flow) needs
 * a purchased TECHNICIAN_SEATS seat. A seat is taken by a technician member of
 * the organisation or by a live (unused, unexpired) technician invite, so a
 * business cannot send more invites than it has seats.
 *
 * Purchased seats come from the organisation owner's oldest READY workspace —
 * the same workspace `/api/addons/checkout` stamps on the seat subscription.
 *
 * Founder ruling (02/11/2026): "trail seat is free..After 15 days the seat needs
 * to be paid". A business on a current trial gets one free seat, for 15 days from
 * the owner's signup, so swapping technicians cannot restart it. Taking it writes
 * an inactive marker row; a paid checkout overwrites that row. Only a business
 * holding the marker can ever be locked, so technicians already working in a live
 * business without a seat are untouched. A paid plan includes no free seat.
 */

import { Prisma, type PrismaClient } from "@prisma/client";
import { TECHNICIAN_SEATS_SKU } from "./technician-seats-addon";
import { isCurrentTrial } from "./trial-expired-pay-route";

type SeatDb = PrismaClient | Prisma.TransactionClient;

export const TRIAL_SEAT_PRICE_ID = "trial-seat";
const TRIAL_SEAT_MS = 15 * 24 * 60 * 60 * 1000;

export const TECHNICIAN_SEAT_REQUIRED_MESSAGE =
  "Every field technician needs a Field Technician Seat, and all of this business's seats are in use. Add a seat on the Add-ons page, then try again.";

export class TechnicianSeatLimitReached extends Error {
  constructor() {
    super(TECHNICIAN_SEAT_REQUIRED_MESSAGE);
    this.name = "TechnicianSeatLimitReached";
  }
}

export interface TechnicianSeatUsage {
  /** Seats on an ACTIVE TECHNICIAN_SEATS entitlement; 0 when none. */
  purchased: number;
  /** The free trial seat: 1 while it is open to this business, otherwise 0. */
  free: number;
  /** Technician members plus live technician invites. */
  used: number;
}

/**
 * The one workspace a business's seats live on: the owner's oldest READY one.
 * Seat counting and seat checkout both read it, so a paid seat always lands
 * where the count looks. Never a workspace the owner is merely a member of.
 */
export function seatWorkspaceFor(db: SeatDb, ownerId: string) {
  return db.workspace.findFirst({
    where: { ownerId, status: "READY" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
}

type SeatRow = { active: boolean; seats: number | null; stripePriceId: string | null } | null;

async function readSeatState(db: SeatDb, organizationId: string) {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { ownerId: true },
  });
  if (!org) return { workspaceId: null, row: null, windowOpen: false, onTrial: false };

  const workspace = await seatWorkspaceFor(db, org.ownerId);
  const row: SeatRow = workspace
    ? await db.featureEntitlement.findUnique({
        where: {
          workspaceId_sku: {
            workspaceId: workspace.id,
            sku: TECHNICIAN_SEATS_SKU,
          },
        },
        select: { active: true, seats: true, stripePriceId: true },
      })
    : null;
  // Bought seats settle it: the owner's trial no longer matters.
  const owner =
    workspace && (!row || row.stripePriceId === TRIAL_SEAT_PRICE_ID)
      ? await db.user.findUnique({
          where: { id: org.ownerId },
          select: { subscriptionStatus: true, trialEndsAt: true, createdAt: true },
        })
      : null;
  return {
    workspaceId: workspace?.id ?? null,
    row,
    windowOpen:
      !!owner && Date.now() < owner.createdAt.getTime() + TRIAL_SEAT_MS,
    onTrial:
      !!owner && isCurrentTrial(owner.subscriptionStatus, owner.trialEndsAt),
  };
}

export async function technicianSeatUsage(
  db: SeatDb,
  organizationId: string,
  opts: { excludeInviteId?: string } = {},
): Promise<TechnicianSeatUsage> {
  const state = await readSeatState(db, organizationId);
  const purchased = state.row?.active ? (state.row.seats ?? 0) : 0;
  const holdsMarker = state.row?.stripePriceId === TRIAL_SEAT_PRICE_ID;
  // A taken seat lasts to day 15 even if the owner buys the plan on day 5. A row
  // of any other kind means seats were bought, and bought seats replace it.
  const free =
    state.workspaceId &&
    state.windowOpen &&
    (holdsMarker || (!state.row && state.onTrial))
      ? 1
      : 0;

  const [members, invites] = await Promise.all([
    db.user.count({ where: { organizationId, role: "USER" } }),
    db.userInvite.count({
      where: {
        organizationId,
        role: "USER",
        usedAt: null,
        expiresAt: { gt: new Date() },
        ...(opts.excludeInviteId ? { id: { not: opts.excludeInviteId } } : {}),
      },
    }),
  ]);

  return { purchased, free, used: members + invites };
}

/**
 * Throws TechnicianSeatLimitReached when one more technician would not fit.
 *
 * Call it inside the transaction that writes the technician. It locks the
 * organisation row first, so two seat-taking writes for one business run one
 * after the other: without the lock, two concurrent role switches each saw
 * the last free seat and both committed.
 */
export async function assertTechnicianSeatAvailable(
  db: SeatDb,
  organizationId: string,
  opts: { excludeInviteId?: string } = {},
): Promise<void> {
  await db.$queryRaw(
    Prisma.sql`SELECT "id" FROM "Organization" WHERE "id" = ${organizationId} FOR UPDATE`,
  );
  const { purchased, free, used } = await technicianSeatUsage(
    db,
    organizationId,
    opts,
  );
  if (used + 1 > purchased + free) throw new TechnicianSeatLimitReached();
  if (used + 1 > purchased) await stampTrialSeat(db, organizationId);
}

async function stampTrialSeat(db: SeatDb, organizationId: string) {
  const { workspaceId } = await readSeatState(db, organizationId);
  if (!workspaceId) return;
  await db.featureEntitlement.upsert({
    where: {
      workspaceId_sku: { workspaceId, sku: TECHNICIAN_SEATS_SKU },
    },
    create: {
      workspaceId,
      sku: TECHNICIAN_SEATS_SKU,
      active: false,
      seats: 0,
      stripePriceId: TRIAL_SEAT_PRICE_ID,
    },
    update: {},
  });
}

/** True from day 15 for a business still on the free seat, until it is paid for. */
export async function isTrialSeatLocked(
  db: SeatDb,
  organizationId: string,
): Promise<boolean> {
  const state = await readSeatState(db, organizationId);
  return state.row?.stripePriceId === TRIAL_SEAT_PRICE_ID && !state.windowOpen;
}

/**
 * The first purchase replaces the free seat, so it must cover whoever that seat
 * was covering. Otherwise an owner who pays for one more technician is refused,
 * because the paid seat only replaced the free one. After day 15 the free seat
 * is gone: paying only to unlock covers the existing technician, while
 * `addingTechnician` also buys for the new one being invited.
 */
export async function seatsNeededToBuy(
  db: SeatDb,
  organizationId: string,
  requested: number,
  opts: { addingTechnician?: boolean } = {},
): Promise<number> {
  const { purchased, free, used } = await technicianSeatUsage(db, organizationId);
  const state = await readSeatState(db, organizationId);
  if (state.row?.stripePriceId !== TRIAL_SEAT_PRICE_ID) return requested;
  const adding = free || opts.addingTechnician;
  return Math.max(requested, used - purchased + (adding ? requested : 0));
}
