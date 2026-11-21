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
import { expectRefused } from "@/tests/helpers/expect-refused";
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

    it("a different note sent under a used request id is refused with 409 and nothing is written", async () => {
      as(ids.tech);
      const body = {
        kind: "CALL",
        body: "Rang the insured",
        clientRequestId: `${S}-draft-2`,
      };
      expect((await POST(post(body), ctx())).status).toBe(201);
      const before = await prisma.jobNote.count({
        where: { inspectionId: ids.inspectionId },
      });
      await expectRefused(
        await POST(post({ ...body, body: "Rang the insured, no answer" }), ctx()),
        409,
        /already saved under this draft/,
      );
      // Same draft id, same text, another person: not their note either.
      as(ids.owner);
      await expectRefused(
        await POST(post(body), ctx()),
        409,
        /already saved under this draft/,
      );
      expect(
        await prisma.jobNote.count({
          where: { inspectionId: ids.inspectionId },
        }),
      ).toBe(before);
    });

    // The app connects as the table owner, which row level security does not
    // bind; only the trigger stands between it and an edit. Each refusal is
    // asserted by the trigger's own words, so a refusal for any other reason
    // (a bad column, a missing row) cannot pass for it.
    const CHANGED = /JobNote \S+ cannot be changed; add a new note to correct it/;
    const REMOVED = /JobNote \S+ cannot be removed; notes are append-only/;

    it("the database refuses to change a note, whoever asks", async () => {
      const note = await prisma.jobNote.findFirstOrThrow({
        where: { inspectionId: ids.inspectionId },
        select: { id: true, body: true, authorUserId: true },
      });
      expect(note.authorUserId).not.toBeNull();
      await expect(
        prisma.jobNote.update({
          where: { id: note.id },
          data: { body: "rewritten" },
        }),
      ).rejects.toThrow(CHANGED);
      await expect(
        prisma.$executeRaw`UPDATE "JobNote" SET "body" = 'rewritten' WHERE "id" = ${note.id}`,
      ).rejects.toThrow(CHANGED);
      // Clearing the author link by hand is not the account's ON DELETE SET
      // NULL, so it is refused too.
      await expect(
        prisma.$executeRaw`UPDATE "JobNote" SET "authorUserId" = NULL WHERE "id" = ${note.id}`,
      ).rejects.toThrow(CHANGED);
      await expect(
        prisma.$executeRaw`UPDATE "JobNote" SET "createdAt" = now() - interval '1 day' WHERE "id" = ${note.id}`,
      ).rejects.toThrow(CHANGED);
      const after = await prisma.jobNote.findUniqueOrThrow({
        where: { id: note.id },
      });
      expect(after.body).toBe(note.body);
      expect(after.authorUserId).toBe(note.authorUserId);
    });

    it("the database refuses to remove a note, whoever asks", async () => {
      const note = await prisma.jobNote.findFirstOrThrow({
        where: { inspectionId: ids.inspectionId },
        select: { id: true },
      });
      await expect(
        prisma.$executeRaw`DELETE FROM "JobNote" WHERE "id" = ${note.id}`,
      ).rejects.toThrow(REMOVED);
      await expect(
        prisma.jobNote.deleteMany({ where: { inspectionId: ids.inspectionId } }),
      ).rejects.toThrow(REMOVED);
      expect(
        await prisma.jobNote.count({ where: { id: note.id } }),
      ).toBe(1);
    });

    // The two foreign-key actions are let through because they run one trigger
    // level down. Depth alone is not enough: any trigger elsewhere runs at that
    // depth too. A probe trigger here deletes and unlinks a note while its job
    // and author still exist; both must be refused.
    it("the database refuses a change or removal issued from another trigger while the job and author exist", async () => {
      const note = await prisma.jobNote.findFirstOrThrow({
        where: { inspectionId: ids.inspectionId, authorUserId: { not: null } },
        select: { id: true, authorUserId: true },
      });
      const probe = `ra8496_probe_${Date.now().toString(36)}`;
      await prisma.$executeRawUnsafe(
        `CREATE TABLE "${probe}" ("op" text NOT NULL, "noteId" text NOT NULL)`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE FUNCTION "${probe}_fn"() RETURNS trigger LANGUAGE plpgsql AS $f$
         BEGIN
           IF NEW."op" = 'delete' THEN
             DELETE FROM "JobNote" WHERE "id" = NEW."noteId";
           ELSE
             UPDATE "JobNote" SET "authorUserId" = NULL WHERE "id" = NEW."noteId";
           END IF;
           RETURN NEW;
         END $f$`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE TRIGGER "${probe}_t" AFTER INSERT ON "${probe}" FOR EACH ROW EXECUTE FUNCTION "${probe}_fn"()`,
      );
      try {
        await expect(
          prisma.$executeRawUnsafe(
            `INSERT INTO "${probe}" VALUES ('delete', $1)`,
            note.id,
          ),
        ).rejects.toThrow(REMOVED);
        await expect(
          prisma.$executeRawUnsafe(
            `INSERT INTO "${probe}" VALUES ('unlink', $1)`,
            note.id,
          ),
        ).rejects.toThrow(CHANGED);
      } finally {
        await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${probe}"`);
        await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${probe}_fn"()`);
      }
      const after = await prisma.jobNote.findUniqueOrThrow({
        where: { id: note.id },
      });
      expect(after.authorUserId).toBe(note.authorUserId);
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

    // Both links are ON UPDATE RESTRICT, so an id change on a job or an account
    // that has notes is refused by the foreign key itself and never reaches the
    // append-only trigger as a cascaded update. Under ON UPDATE CASCADE the
    // trigger refused it instead, so "it is refused" alone would not tell the
    // two apart: this test checks the catalog and which constraint refused.
    it("job and author links are ON UPDATE RESTRICT, and an id change is refused by the foreign key", async () => {
      const rows = await prisma.$queryRaw<
        { conname: string; confupdtype: string; confdeltype: string }[]
      >`SELECT conname, confupdtype::text AS confupdtype, confdeltype::text AS confdeltype
          FROM pg_constraint
         WHERE conrelid = '"JobNote"'::regclass AND contype = 'f'
         ORDER BY conname`;
      expect(rows).toEqual([
        {
          conname: "JobNote_authorUserId_fkey",
          confupdtype: "r",
          confdeltype: "n",
        },
        {
          conname: "JobNote_inspectionId_fkey",
          confupdtype: "r",
          confdeltype: "c",
        },
      ]);

      const note = await prisma.jobNote.findFirstOrThrow({
        where: { inspectionId: ids.inspectionId },
        select: { id: true },
      });
      let message = "";
      try {
        await prisma.$executeRaw`UPDATE "Inspection" SET "id" = ${`${S}-moved`} WHERE "id" = ${ids.inspectionId}`;
      } catch (e) {
        message = String((e as Error)?.message ?? e);
      }
      expect(message).toContain("JobNote_inspectionId_fkey");
      expect(message).not.toContain("cannot be changed");
      const still = await prisma.jobNote.findUniqueOrThrow({
        where: { id: note.id },
      });
      expect(still.inspectionId).toBe(ids.inspectionId);
    });

    it("another business gets 404 on read and add, and leaves no row", async () => {
      const before = await prisma.jobNote.count({
        where: { inspectionId: ids.inspectionId },
      });
      as(ids.outsider);
      await expectRefused(
        await GET(new NextRequest(url()), ctx()),
        404,
        /NOT_FOUND/,
      );
      await expectRefused(
        await POST(post({ body: "Outsider note" }), ctx()),
        404,
        /NOT_FOUND/,
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
        await expectRefused(
          await GET(new NextRequest(url()), ctx()),
          503,
          /FEATURE_UNAVAILABLE/,
        );
        await expectRefused(
          await POST(post({ body: "While missing" }), ctx()),
          503,
          /FEATURE_UNAVAILABLE/,
        );
      } finally {
        await prisma.$executeRawUnsafe(
          'ALTER TABLE "JobNote_ra8496_hidden" RENAME TO "JobNote"',
        );
      }
    });
  },
);
