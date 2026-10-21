/**
 * J3 starting world: the shared two-firm world plus what a paying firm A
 * already has before a claim starts. Nothing here is a step under test.
 *
 * - A READY workspace owned by A_OWNER with the PAYMENTS, FLOORPLAN_UNDERLAY
 *   and BOOKKEEPING add-ons active, so the payment and scrape routes reach
 *   their subject instead of answering 402 from the add-on gate.
 *
 * standInSend() is the one write the harness makes mid-flow, and only after
 * the real send route has been called and recorded: it marks a DRAFT invoice
 * SENT, standing in for the email step exactly as the repo's own
 * app/api/test/v1-reference-claim/issue-invoice helper does. Every payment
 * row that depends on it says so in its detail.
 */
import { prisma } from "@/lib/prisma";
import { buildWorld, type World } from "../../runner/world";

export interface J3World extends World {
  workspaceA: string | null;
}

export async function buildJ3World(tag: string): Promise<J3World> {
  const w = await buildWorld(tag);
  let workspaceA: string | null = null;
  try {
    const ws = await prisma.workspace.create({
      data: { name: `Firm A WS ${w.run}`, slug: `${w.run}-a`, ownerId: w.users.A_OWNER.id, status: "READY" },
    });
    workspaceA = ws.id;
    for (const sku of ["PAYMENTS", "FLOORPLAN_UNDERLAY", "BOOKKEEPING"] as const) {
      await prisma.featureEntitlement.create({ data: { workspaceId: ws.id, sku, active: true } });
    }
  } catch (err) {
    w.seedErrors.push(`workspace: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`);
  }
  return { ...w, workspaceA };
}

/** Clear the rate-limit rows keyed by this world's users only. */
export async function resetRateLimits(w: World): Promise<void> {
  for (const u of Object.values(w.users)) {
    await prisma.rateLimitHit.deleteMany({ where: { key: { contains: u.id } } });
  }
}

export async function standInSend(invoiceId: string): Promise<boolean> {
  const r = await prisma.invoice.updateMany({ where: { id: invoiceId, status: "DRAFT" }, data: { status: "SENT", sentDate: new Date() } });
  return r.count === 1;
}
