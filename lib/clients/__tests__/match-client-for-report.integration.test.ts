/**
 * WP-02 / walkthrough finding 2 — a new report must never attach to an
 * existing client by NAME alone, and must never rewrite that client's email or
 * address. Real database; runs when DATABASE_URL is set.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { matchClientForReport } from "../match-client-for-report";

const HAS_DB = !!process.env.DATABASE_URL;
const S = `wp02-${Date.now().toString(36)}`;
let userId = "";
let firstId = "";

const run = (input: Parameters<typeof matchClientForReport>[2]) =>
  prisma.$transaction((tx) => matchClientForReport(tx, userId, input));

describe.skipIf(!HAS_DB)("client matching for a new report (WP-02)", () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: `${S}-u@test.local` } });
    userId = u.id;
    const c = await prisma.client.create({
      data: {
        name: "Test Owner",
        email: `${S}-a@test.local`,
        phone: null,
        address: "1 Alpha St",
        userId,
      },
    });
    firstId = c.id;
  });

  afterAll(async () => {
    await prisma.client.deleteMany({ where: { userId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it("a second customer with the same name and a different email becomes a new client", async () => {
    const r = await run({
      name: "Test Owner",
      email: `${S}-b@test.local`,
      phone: null,
      address: "2 Beta St",
    });
    expect(r.clientId).not.toBeNull();
    expect(r.clientId).not.toBe(firstId);
  });

  it("the first customer's email and address are untouched", async () => {
    const first = await prisma.client.findUniqueOrThrow({
      where: { id: firstId },
      select: { email: true, address: true },
    });
    expect(first.email).toBe(`${S}-a@test.local`);
    expect(first.address).toBe("1 Alpha St");
  });

  it("the same email reaches the same client, fills a blank phone, and keeps the stored address", async () => {
    const r = await run({
      name: "Someone Else Entirely",
      email: `${S}-a@test.local`,
      phone: "0400 000 000",
      address: "9 Gamma St",
    });
    expect(r.clientId).toBe(firstId);
    const first = await prisma.client.findUniqueOrThrow({
      where: { id: firstId },
      select: { phone: true, address: true },
    });
    expect(first.phone).toBe("0400 000 000");
    expect(first.address).toBe("1 Alpha St");
  });

  it("a name match with no email never links to the existing client", async () => {
    const r = await run({
      name: "Test Owner",
      email: null,
      phone: null,
      address: "3 Delta St",
    });
    expect(r.clientId).toBeNull();
    expect(r.warning).toMatch(/email/i);
  });
});
