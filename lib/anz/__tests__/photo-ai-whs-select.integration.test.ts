/**
 * RA-7640 — real-database proof that `AI_RAISED_ACM_PHOTOS_SELECT` finds a
 * photo whose `metadata.photoAi.whsLatch.aiRaisedAcm` is true, and nothing on a
 * job without one.
 *
 * The scope and PDF route tests mock Prisma, so they can only assert the
 * filter the route sends. Whether Postgres matches that JSON path is decided
 * here. The latched photo is created after several unlatched ones, so a
 * filter that did nothing would return an unlatched row under `take: 1` and
 * `jobHasAiRaisedAcm` would come back false.
 *
 * Runs only when DATABASE_URL is set (CI Quality Checks against a migrated
 * pgvector pg16), in line with the RA-7618 latch-race integration test.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  AI_RAISED_ACM_PHOTOS_SELECT,
  jobHasAiRaisedAcm,
} from "@/lib/anz/photo-ai-whs";

const S = `ra7640-${Date.now().toString(36)}`;
const ids = { userId: "", latchedJob: "", cleanJob: "" };

const photo = (inspectionId: string, n: number, metadata: object) => ({
  inspectionId,
  url: `https://example.com/${S}-${n}.jpg`,
  mimeType: "image/jpeg",
  affectedMaterial: [],
  secondaryDamageIndicators: [],
  metadata,
});

const NOT_LATCHED = [
  {},
  { photoAi: {} },
  { photoAi: { whsLatch: { aiRaisedAcm: false } } },
];

async function readLatch(inspectionId: string) {
  const row = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: AI_RAISED_ACM_PHOTOS_SELECT,
  });
  return row?.photos ?? [];
}

describe.skipIf(!process.env.DATABASE_URL)(
  "AI_RAISED_ACM_PHOTOS_SELECT on Postgres (RA-7640)",
  () => {
    beforeAll(async () => {
      const user = await prisma.user.create({
        data: {
          email: `${S}-owner@test.local`,
          role: "ADMIN",
          subscriptionStatus: "TRIAL",
        },
      });
      ids.userId = user.id;
      for (const key of ["latchedJob", "cleanJob"] as const) {
        const inspection = await prisma.inspection.create({
          data: {
            inspectionNumber: `${S}-${key}`,
            propertyAddress: "1 Latch St",
            propertyPostcode: "4000",
            userId: user.id,
          },
        });
        ids[key] = inspection.id;
      }
      let n = 0;
      for (const metadata of NOT_LATCHED) {
        await prisma.inspectionPhoto.create({
          data: photo(ids.latchedJob, n++, metadata),
        });
        await prisma.inspectionPhoto.create({
          data: photo(ids.cleanJob, n++, metadata),
        });
      }
      await prisma.inspectionPhoto.create({
        data: photo(ids.latchedJob, n++, {
          photoAi: { whsLatch: { aiRaisedAcm: true } },
        }),
      });
    });

    afterAll(async () => {
      if (ids.userId) {
        await prisma.inspectionPhoto.deleteMany({
          where: { inspectionId: { in: [ids.latchedJob, ids.cleanJob] } },
        });
        await prisma.inspection.deleteMany({ where: { userId: ids.userId } });
        await prisma.user.delete({ where: { id: ids.userId } });
      }
    });

    it("returns the latched photo from among unlatched ones", async () => {
      const photos = await readLatch(ids.latchedJob);
      expect(photos).toHaveLength(1);
      expect(jobHasAiRaisedAcm(photos)).toBe(true);
    });

    it("returns nothing for a job whose photos never raised the latch", async () => {
      const photos = await readLatch(ids.cleanJob);
      expect(photos).toEqual([]);
      expect(jobHasAiRaisedAcm(photos)).toBe(false);
    });
  },
);
