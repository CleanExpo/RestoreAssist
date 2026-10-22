/**
 * JEV world — two synthetic restoration firms on the throwaway database.
 *
 * Firm A holds records whose text carries MARK_A. Nobody outside firm A may
 * ever see that string: it is the leak oracle for the cross-tenant cases.
 * Firm B is the attacker. Every value is synthetic; nothing here resembles a
 * real customer.
 */
import { prisma } from "@/lib/prisma";

export type IdentityName = "anon" | "A_OWNER" | "A_MANAGER" | "A_TECH" | "B_OWNER" | "B_TECH";
export const IDENTITIES: IdentityName[] = ["anon", "A_OWNER", "A_MANAGER", "A_TECH", "B_OWNER", "B_TECH"];
export const FIRM_A: IdentityName[] = ["A_OWNER", "A_MANAGER", "A_TECH"];

/**
 * Clear rate-limiter state before a case, as J3's world does for its users.
 * Some limiters key on the user, the capture token or a process-local Map, so
 * the per-call client address alone cannot keep one case's earlier calls from
 * answering 429 before the handler under test runs. The throwaway database is
 * this run's own, so every row may go. Planted controls keep their own state.
 */
export async function clearRateLimits(): Promise<void> {
  const { __resetRateLimitStore } = await import("@/lib/rate-limiter");
  const { __resetBulkRateLimit } = await import("@/lib/bulk-operations");
  await __resetRateLimitStore();
  __resetBulkRateLimit();
}

export interface World {
  run: string;
  markA: string;
  users: Record<Exclude<IdentityName, "anon">, { id: string; email: string; role: string; organizationId: string }>;
  orgA: string;
  orgB: string;
  a: { client: string; report: string; inspection: string; estimate: string; invoice: string | null };
  b: { client: string; inspection: string };
  seedErrors: string[];
}

export function sessionUser(w: World, who: IdentityName): Record<string, unknown> | null {
  if (who === "anon") return null;
  const u = w.users[who];
  return { id: u.id, email: u.email, name: who, role: u.role, organizationId: u.organizationId, organizationScopeVerified: true };
}

async function attempt<T>(errors: string[], label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    errors.push(`${label}: ${err instanceof Error ? err.message.split("\n").slice(-3).join(" ").slice(0, 300) : String(err)}`);
    return null;
  }
}

export async function buildWorld(tag: string): Promise<World> {
  const run = `jev-${tag}-${Date.now().toString(36)}`;
  const markA = `JEVSECRETA${Date.now().toString(36).toUpperCase()}`;
  const errors: string[] = [];
  const mkUser = (key: string, role: "ADMIN" | "MANAGER" | "USER") =>
    prisma.user.create({
      data: { email: `${run}-${key.toLowerCase()}@jev.test`, name: `${key} ${run}`, role, subscriptionStatus: "ACTIVE" },
    });
  const aOwner = await mkUser("A_OWNER", "ADMIN");
  const bOwner = await mkUser("B_OWNER", "ADMIN");
  const orgA = await prisma.organization.create({ data: { name: `Firm A ${run}`, ownerId: aOwner.id, country: "AU" } });
  const orgB = await prisma.organization.create({ data: { name: `Firm B ${run}`, ownerId: bOwner.id, country: "AU" } });
  const aManager = await mkUser("A_MANAGER", "MANAGER");
  const aTech = await mkUser("A_TECH", "USER");
  const bTech = await mkUser("B_TECH", "USER");
  for (const [u, org] of [
    [aOwner, orgA],
    [aManager, orgA],
    [aTech, orgA],
    [bOwner, orgB],
    [bTech, orgB],
  ] as const) {
    await prisma.user.update({ where: { id: u.id }, data: { organizationId: org.id } });
  }
  const u = (x: { id: string; email: string; role: string }, org: string) => ({ id: x.id, email: x.email, role: x.role, organizationId: org });

  const aClient = await prisma.client.create({
    data: { name: `${markA} Client`, email: `${run}-ac@jev.test`, phone: "0400000000", address: `1 ${markA} St`, userId: aOwner.id },
  });
  const bClient = await prisma.client.create({ data: { name: "Firm B Client", email: `${run}-bc@jev.test`, userId: bOwner.id } });
  const aReport = await prisma.report.create({
    data: { title: `${markA} Report`, clientName: `${markA} Client`, propertyAddress: `1 ${markA} St`, hazardType: "Water", insuranceType: "Building", userId: aOwner.id },
  });
  const aInspection = await prisma.inspection.create({
    data: {
      inspectionNumber: `NIR-${run}-A`,
      propertyAddress: `1 ${markA} St, Brisbane QLD`,
      propertyPostcode: "4000",
      userId: aOwner.id,
      technicianId: aTech.id,
      technicianName: "A_TECH",
      clientId: aClient.id,
    },
  });
  const bInspection = await prisma.inspection.create({
    data: { inspectionNumber: `NIR-${run}-B`, propertyAddress: "2 Other St, Sydney NSW", propertyPostcode: "2000", userId: bOwner.id, clientId: bClient.id },
  });
  const aEstimate = await prisma.estimate.create({ data: { reportId: aReport.id, userId: aOwner.id, createdBy: aOwner.id, updatedBy: aOwner.id } });
  const aInvoice = await attempt(errors, "invoice", () =>
    prisma.invoice.create({
      data: {
        invoiceNumber: `RA-${run}-0001`,
        dueDate: new Date(Date.now() + 14 * 864e5),
        customerName: `${markA} Client`,
        customerEmail: `${run}-ac@jev.test`,
        subtotalExGST: 100000,
        gstAmount: 10000,
        totalIncGST: 110000,
        amountDue: 110000,
        userId: aOwner.id,
        clientId: aClient.id,
      } as never,
    }),
  );

  return {
    run,
    markA,
    users: {
      A_OWNER: u(aOwner, orgA.id),
      A_MANAGER: u(aManager, orgA.id),
      A_TECH: u(aTech, orgA.id),
      B_OWNER: u(bOwner, orgB.id),
      B_TECH: u(bTech, orgB.id),
    },
    orgA: orgA.id,
    orgB: orgB.id,
    a: { client: aClient.id, report: aReport.id, inspection: aInspection.id, estimate: aEstimate.id, invoice: (aInvoice as { id: string } | null)?.id ?? null },
    b: { client: bClient.id, inspection: bInspection.id },
    seedErrors: errors,
  };
}

/** The firm-A record id a dynamic segment most plausibly names, from the route path. */
export function aIdFor(w: World, route: string, param: string): string {
  const before = route.split(`[${param}]`)[0] ?? route;
  const seg = before.split("/").filter(Boolean).pop() ?? "";
  if (/invoice/.test(seg) && w.a.invoice) return w.a.invoice;
  if (/client|contact|customer/.test(seg)) return w.a.client;
  if (/report/.test(seg)) return w.a.report;
  if (/estimate/.test(seg)) return w.a.estimate;
  if (/org/.test(seg)) return w.orgA;
  if (/user|member/.test(seg)) return w.users.A_OWNER.id;
  return w.a.inspection;
}
