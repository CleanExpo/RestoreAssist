/**
 * WP-06 / walkthrough finding 5 — billing belongs to the owner.
 *
 * Any invited technician could open the owner's Stripe billing portal and was
 * steered to a $99 checkout for themselves. Real database for users and
 * organisations; Stripe is a recording fake. Runs when DATABASE_URL is set.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const { stripeCalls, fake } = vi.hoisted(() => {
  const calls: string[] = [];
  const make = (path: string[]): unknown =>
    new Proxy(function () {}, {
      get: (_t, key) => make([...path, String(key)]),
      apply: () => {
        calls.push(path.join("."));
        throw new Error(`STRIPE_REACHED:${path.join(".")}`);
      },
    });
  return { stripeCalls: calls, fake: make };
});
vi.mock("@/lib/stripe", () => ({ stripe: fake(["stripe"]) }));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { POST as portal } from "@/app/api/subscription/portal/route";
import { POST as checkout } from "@/app/api/create-checkout-session/route";
import { POST as addons } from "@/app/api/addons/checkout/route";
import { POST as cancel } from "@/app/api/cancel-subscription/route";
import { POST as reactivate } from "@/app/api/reactivate-subscription/route";

const HAS_DB = !!process.env.DATABASE_URL;
const S = `wp06-${Date.now().toString(36)}`;
const ids = { owner: "", manager: "", tech: "", solo: "", org: "" };

const routes: [string, (r: NextRequest) => Promise<Response>, object][] = [
  ["subscription/portal", portal, {}],
  ["create-checkout-session", checkout, {}],
  ["addons/checkout", addons, { sku: "FIELD_TECHNICIAN_SEAT" }],
  ["cancel-subscription", cancel, {}],
  ["reactivate-subscription", reactivate, {}],
];

async function call(
  fn: (r: NextRequest) => Promise<Response>,
  body: object,
  userId: string,
) {
  getServerSession.mockResolvedValue({ user: { id: userId } });
  const res = await fn(
    new NextRequest("http://localhost/api/x", {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        host: "localhost",
        origin: "http://localhost",
        "idempotency-key": `${S}-${Math.random().toString(36).slice(2)}`,
      },
    }),
  );
  return res.status;
}

describe.skipIf(!HAS_DB)("billing is owner-only (WP-06)", () => {
  beforeAll(async () => {
    const mk = (n: string, role: "ADMIN" | "MANAGER" | "USER", organizationId?: string) =>
      prisma.user.create({
        data: { email: `${S}-${n}@test.local`, role, organizationId, stripeCustomerId: `cus_${S}_${n}` },
      });
    const owner = await mk("owner", "ADMIN");
    const org = await prisma.organization.create({ data: { name: `${S}-o`, ownerId: owner.id } });
    await prisma.user.update({ where: { id: owner.id }, data: { organizationId: org.id } });
    const manager = await mk("manager", "MANAGER", org.id);
    const tech = await mk("tech", "USER", org.id);
    const solo = await mk("solo", "ADMIN");
    Object.assign(ids, { owner: owner.id, manager: manager.id, tech: tech.id, solo: solo.id, org: org.id });
  });

  beforeEach(() => {
    stripeCalls.length = 0;
  });

  afterAll(async () => {
    const all = [ids.owner, ids.manager, ids.tech, ids.solo];
    const swallow = (p: Promise<unknown>) => p.catch(() => {});
    await swallow(prisma.idempotencyRecord.deleteMany({ where: { scope: { in: all } } }));
    await swallow(prisma.user.updateMany({ where: { id: { in: all } }, data: { organizationId: null } }));
    await swallow(prisma.organization.deleteMany({ where: { id: ids.org } }));
    await swallow(prisma.user.deleteMany({ where: { id: { in: all } } }));
    await prisma.$disconnect();
  });

  for (const [name, fn, body] of routes) {
    it(`${name}: a technician is refused before Stripe is reached`, async () => {
      expect(await call(fn, body, ids.tech)).toBe(403);
      expect(stripeCalls).toEqual([]);
    });

    it(`${name}: a manager is refused before Stripe is reached`, async () => {
      expect(await call(fn, body, ids.manager)).toBe(403);
      expect(stripeCalls).toEqual([]);
    });

    it(`${name}: the owner and a solo operator are not refused`, async () => {
      expect(await call(fn, body, ids.owner)).not.toBe(403);
      expect(await call(fn, body, ids.solo)).not.toBe(403);
    });
  }
});
