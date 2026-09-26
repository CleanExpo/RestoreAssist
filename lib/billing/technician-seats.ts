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
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { TECHNICIAN_SEATS_SKU } from "./technician-seats-addon";

type SeatDb = PrismaClient | Prisma.TransactionClient;

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
  /** Technician members plus live technician invites. */
  used: number;
}

export async function technicianSeatUsage(
  db: SeatDb,
  organizationId: string,
  opts: { excludeInviteId?: string } = {},
): Promise<TechnicianSeatUsage> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { ownerId: true },
  });

  let purchased = 0;
  if (org) {
    const workspace = await db.workspace.findFirst({
      where: { ownerId: org.ownerId, status: "READY" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (workspace) {
      const entitlement = await db.featureEntitlement.findUnique({
        where: {
          workspaceId_sku: { workspaceId: workspace.id, sku: TECHNICIAN_SEATS_SKU },
        },
        select: { active: true, seats: true },
      });
      if (entitlement?.active) purchased = entitlement.seats ?? 0;
    }
  }

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

  return { purchased, used: members + invites };
}

/** Throws TechnicianSeatLimitReached when one more technician would not fit. */
export async function assertTechnicianSeatAvailable(
  db: SeatDb,
  organizationId: string,
  opts: { excludeInviteId?: string } = {},
): Promise<void> {
  const { purchased, used } = await technicianSeatUsage(db, organizationId, opts);
  if (used + 1 > purchased) throw new TechnicianSeatLimitReached();
}
