/**
 * RA-8496 — job notes against a real database: tenancy and the stamp.
 *
 * Three people: the owner (ADMIN) of business A, who creates the job; a
 * technician (USER) in business A; and the owner (ADMIN) of business B. The
 * technician may read and add notes; business B gets 404 on both, and its
 * attempt leaves no row behind.
 *
 * Also proven here, because only a real database can show them: the
 * append-only trigger refuses changes and removals from any caller while
 * still letting the two foreign-key actions through; a retried save makes
 * one note; and a missing table answers 503, not 500.
 *
 * Runs only when DATABASE_URL is set (CI, `npm run test:db`). Session is
 * mocked; Prisma is real.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { prisma } from "@/lib/prisma";
import { GET, POST } from "../route";

const S = `ra8496-${Date.now().toString(36)}`;
const ids = {
  owner: "",
  tech: "",
  outsider: "",
  inspectionId: "",
  orgs: [] as string[],
};

const as = (userId: string) =>
  getServerSession.mockResolvedValue({ user: { id: userId } });
const ctx = () => ({ params: Promise.resolve({ id: ids.inspectionId }) });
const url = () => `http://localhost/api/inspections/${ids.inspectionId}/notes`;
const post = (body: unknown) =>
  new NextRequest(url(), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

describe.skipIf(!process.env.DATABASE_URL)(
  "RA-8496 job notes (real database)",
  () => {
    beforeAll(async () => {
      const mk = (suffix: string, role: "ADMIN" | "USER", name: string) =>
        prisma.user.create({
          data: {
            email: `${S}-${suffix}@test.local`,
            name,
            role,
            subscriptionStatus: "TRIAL",
          },
        });
      const owner = await mk("owner", "ADMIN", "Owner A");
      const tech = await mk("tech", "USER", "Tech A");
      const outsider = await mk("outsider", "ADMIN", "Owner B");
      Object.assign(ids, {
        owner: owner.id,
        tech: tech.id,
        outsider: outsider.id,
      });

      const orgA = await prisma.organization.create({
        data: { name: `${S} A`, ownerId: owner.id, country: "AU" },
      });
      const orgB = await prisma.organization.create({
        data: { name: `${S} B`, ownerId: outsider.id, country: "AU" },
      });
      ids.orgs = [orgA.id, orgB.id];
      await prisma.user.updateMany({
        where: { id: { in: [owner.id, tech.id] } },
        data: { organizationId: orgA.id },
      });
      await prisma.user.update({
        where: { id: outsider.id },
        data: { organizationId: orgB.id },
      });

      ids.inspectionId = (
        await prisma.inspection.create({
          data: {
            inspectionNumber: `${S}-insp`,
            propertyAddress: "1 Note St",
            propertyPostcode: "2000",
            userId: owner.id,
            claimType: "WATER",
          },
        })
      ).id;
    });

    afterAll(async () => {
      const users = [ids.owner, ids.tech, ids.outsider].filter(Boolean);
      // Notes cascade with the job.
      if (ids.inspectionId)
        await prisma.inspection.deleteMany({ where: { id: ids.inspectionId } });
      await prisma.rateLimitHit.deleteMany({
        where: { OR: users.map((u) => ({ key: { contains: u } })) },
      });
      await prisma.user.updateMany({
        where: { id: { in: users } },
        data: { organizationId: null },
      });
      await prisma.organization.deleteMany({ where: { id: { in: ids.orgs } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    });

    it("the owner and the technician add notes; the list is newest first with the stamp", async () => {
      as(ids.owner);
      expect(
        (await POST(post({ kind: "CALL", body: "Rang the insured" }), ctx()))
          .status,
      ).toBe(201);
      as(ids.tech);
      const res = await POST(
        post({ body: "On site, mould behind vanity" }),
        ctx(),
      );
      expect(res.status, await res.clone().text()).toBe(201);

      const list = await (await GET(new NextRequest(url()), ctx())).json();
      expect(list.data.map((n: { body: string }) => n.body)).toEqual([
        "On site, mould behind vanity",
        "Rang the insured",
      ]);
      expect(list.data[0]).toMatchObject({
        authorName: "Tech A",
        authorRole: "USER",
        kind: "GENERAL",
      });
      expect(list.data[1]).toMatchObject({
        authorName: "Owner A",
        authorRole: "ADMIN",
        kind: "CALL",
      });
      expect(new Date(list.data[0].createdAt).toISOString()).toBe(
        list.data[0].createdAt,
      );
    });

    it("a save retried with the same request id makes one note, and returns it", async () => {
      as(ids.tech);
      const before = await prisma.jobNote.count({
        where: { inspectionId: ids.inspectionId },
      });
      const body = {
        kind: "BOOKING",
        body: "Booked for Tuesday",
        clientRequestId: `${S}-draft-1`,
      };
      const first = await POST(post(body), ctx());
      expect(first.status).toBe(201);
      const second = await POST(post(body), ctx());
      expect(second.status).toBe(200);
      expect((await second.json()).data.id).toBe((await first.json()).data.id);
      expect(
        await prisma.jobNote.count({
          where: { inspectionId: ids.inspectionId },
        }),
      ).toBe(before + 1);
    });

    it("the database refuses to change or remove a note, whoever asks", async () => {
      const note = await prisma.jobNote.findFirstOrThrow({
        where: { inspectionId: ids.inspectionId },
        select: { id: true, body: true },
      });
      await expect(
        prisma.jobNote.update({
          where: { id: note.id },
          data: { body: "rewritten" },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.$executeRaw`UPDATE "JobNote" SET "authorUserId" = NULL WHERE "id" = ${note.id}`,
      ).rejects.toThrow();
      await expect(
        prisma.$executeRaw`DELETE FROM "JobNote" WHERE "id" = ${note.id}`,
      ).rejects.toThrow();
      const after = await prisma.jobNote.findUniqueOrThrow({
        where: { id: note.id },
      });
      expect(after.body).toBe(note.body);
    });

    it("closing an author's account keeps their notes with name and role, and only clears the link", async () => {
      const leaver = await prisma.user.create({
        data: {
          email: `${S}-leaver@test.local`,
          name: "Lee Leaver",
          role: "USER",
          subscriptionStatus: "TRIAL",
          organizationId: ids.orgs[0],
        },
      });
      as(leaver.id);
      const res = await POST(
        post({ kind: "CALL", body: "Left a voicemail" }),
        ctx(),
      );
      expect(res.status).toBe(201);
      const { id } = (await res.json()).data;
      await prisma.rateLimitHit.deleteMany({
        where: { key: { contains: leaver.id } },
      });
      await prisma.user.delete({ where: { id: leaver.id } });
      const kept = await prisma.jobNote.findUniqueOrThrow({ where: { id } });
      expect(kept).toMatchObject({
        authorUserId: null,
        authorName: "Lee Leaver",
        authorRole: "USER",
        body: "Left a voicemail",
      });
    });

    it("deleting the job removes its notes (the one accepted way a note goes)", async () => {
      const job = await prisma.inspection.create({
        data: {
          inspectionNumber: `${S}-insp-2`,
          propertyAddress: "2 Note St",
          propertyPostcode: "2000",
          userId: ids.owner,
          claimType: "WATER",
        },
      });
      await prisma.jobNote.create({
        data: {
          inspectionId: job.id,
          authorUserId: ids.owner,
          authorName: "Owner A",
          authorRole: "ADMIN",
          body: "x",
        },
      });
      await prisma.inspection.delete({ where: { id: job.id } });
      expect(
        await prisma.jobNote.count({ where: { inspectionId: job.id } }),
      ).toBe(0);
    });

    it("another business gets 404 on read and add, and leaves no row", async () => {
      const before = await prisma.jobNote.count({
        where: { inspectionId: ids.inspectionId },
      });
      as(ids.outsider);
      expect((await GET(new NextRequest(url()), ctx())).status).toBe(404);
      expect((await POST(post({ body: "Outsider note" }), ctx())).status).toBe(
        404,
      );
      expect(
        await prisma.jobNote.count({
          where: { inspectionId: ids.inspectionId },
        }),
      ).toBe(before);
    });

    // Last: production sits in this state from merge until the owner applies the
    // migration, and nothing else has ever shown the pg adapter's error for a
    // missing table is P2021.
    it("with the table missing, read and add answer 503 FEATURE_UNAVAILABLE, not 500", async () => {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "JobNote" RENAME TO "JobNote_ra8496_hidden"',
      );
      try {
        as(ids.owner);
        const got = await GET(new NextRequest(url()), ctx());
        expect(got.status, await got.clone().text()).toBe(503);
        expect((await got.json()).error.code).toBe("FEATURE_UNAVAILABLE");
        const added = await POST(post({ body: "While missing" }), ctx());
        expect(added.status, await added.clone().text()).toBe(503);
        expect((await added.json()).error.code).toBe("FEATURE_UNAVAILABLE");
      } finally {
        await prisma.$executeRawUnsafe(
          'ALTER TABLE "JobNote_ra8496_hidden" RENAME TO "JobNote"',
        );
      }
    });
  },
);
