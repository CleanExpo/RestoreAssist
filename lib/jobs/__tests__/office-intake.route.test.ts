/**
 * RA-8495 — the intake route end to end on Postgres, with the real
 * idempotency store: a retried save replays the first job instead of taking a
 * second number, and a member with no organisation leaves no counter behind.
 * Runs only with DATABASE_URL (npm run test:db).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.hoisted(() => vi.fn());
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/integrations/zoho/queue", () => ({ scheduleZohoInspectionPush: () => {} }));

import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/inspections/intake/route";

const S = `ra8495r-${Date.now().toString(36)}`;
const ids = { member: "", leaver: "", org: "" };

const body = {
  propertyAddress: "3 Synthetic Road, Parramatta NSW",
  propertyPostcode: "2150",
  clientType: "INSURANCE_COMPANY",
  claimType: "WATER",
  insuredName: "Synthetic Person",
};

function post(key: string, payload: unknown = body) {
  return new NextRequest("http://localhost/api/inspections/intake", {
    method: "POST",
    headers: { "content-type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(payload),
  });
}

describe.skipIf(!process.env.DATABASE_URL)("office intake route on Postgres (RA-8495)", () => {
  beforeAll(async () => {
    const member = await prisma.user.create({
      data: { email: `${S}-member@test.local`, role: "USER", subscriptionStatus: "TRIAL" },
    });
    const org = await prisma.organization.create({
      data: { name: "Retry Restorations", ownerId: member.id, members: { connect: { id: member.id } } },
    });
    const leaver = await prisma.user.create({
      data: {
        email: `${S}-leaver@test.local`,
        role: "ADMIN",
        subscriptionStatus: "TRIAL",
        organizationLeftAt: new Date(),
        organizationLeftId: org.id,
      },
    });
    Object.assign(ids, { member: member.id, leaver: leaver.id, org: org.id });
  });

  afterAll(async () => {
    await prisma.inspection.deleteMany({ where: { userId: { in: [ids.member, ids.leaver] } } });
    await prisma.organization.deleteMany({ where: { id: ids.org } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.member, ids.leaver] } } });
  });

  it("a retried save with the same key returns the first job and takes no second number", async () => {
    getServerSession.mockResolvedValue({ user: { id: ids.member } });
    const key = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";
    const first = await POST(post(key));
    expect(first.status).toBe(201);
    const firstJson = await first.json();
    expect(firstJson.inspection.jobNumber).toBe("RR-0001");

    const retry = await POST(post(key));
    expect(retry.status).toBe(201);
    expect((await retry.json()).inspection.id).toBe(firstJson.inspection.id);

    const jobs = await prisma.inspection.count({ where: { jobNumberOrganizationId: ids.org } });
    expect(jobs).toBe(1);
    const seq = await prisma.organizationJobSequence.findUnique({ where: { organizationId: ids.org } });
    expect(seq?.lastValue).toBe(1);

    const stored = await prisma.inspection.findUnique({
      where: { id: firstJson.inspection.id },
      select: { userId: true, clientType: true, insuredName: true, source: true },
    });
    expect(stored).toEqual({
      userId: ids.member,
      clientType: "INSURANCE_COMPANY",
      insuredName: "Synthetic Person",
      source: "OFFICE_INTAKE",
    });

    const next = await POST(post("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2"));
    expect((await next.json()).inspection.jobNumber).toBe("RR-0002");
  });

  it("a member who left the organisation is refused and leaves no counter row for the other organisation", async () => {
    getServerSession.mockResolvedValue({ user: { id: ids.leaver } });
    const before = await prisma.organizationJobSequence.findUnique({ where: { organizationId: ids.org } });
    const res = await POST(post("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee3", { ...body, organizationId: ids.org }));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("NO_ORGANISATION");
    const after = await prisma.organizationJobSequence.findUnique({ where: { organizationId: ids.org } });
    expect(after?.lastValue).toBe(before?.lastValue);
    expect(await prisma.inspection.count({ where: { userId: ids.leaver } })).toBe(0);
  });
});
