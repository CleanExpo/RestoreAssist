/**
 * RA-7618 — Real-database proof that a no-ACM classify run cannot clear
 * `metadata.photoAi.whsLatch.aiRaisedAcm` after an overlapping raise.
 *
 * The product lock is `SELECT "id" FROM "InspectionPhoto" … FOR UPDATE`
 * inside the write transaction in `../route.ts`. This file is the control
 * that observes that serialisation on Postgres; the sibling `route.test.ts`
 * only asserts mock call order.
 *
 * Discriminator (same test, opposite outcome):
 *   - With the lock, the route's first statement in the write transaction
 *     blocks until T0 commits, then reads `aiRaisedAcm === true`. The
 *     raise-only stamp keeps it true.
 *   - Without the lock, `findUnique` is a plain read so it does not wait:
 *     it snapshots `false`, the later UPDATE waits for T0, then overwrites
 *     the committed `true` with that stale `false`.
 *
 * Runs only when DATABASE_URL is set (CI Quality Checks against a migrated
 * pgvector pg16). Skipped locally without one, in line with
 * `app/api/inspections/__tests__/route.org-reach.integration.test.ts`.
 *
 * Module mocks stay at the boundary: session, Vision, and the workspace
 * Anthropic key (so the handler never 402s). Prisma is real.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

const getServerSession = vi.fn();
const autoClassifyPhoto = vi.fn();
const resolveWorkspaceAiKey = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/services/ai/auto-classify-photo", () => ({
  autoClassifyPhoto: (...a: unknown[]) => autoClassifyPhoto(...a),
}));
vi.mock("@/lib/ai/resolve-workspace-ai-key", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/ai/resolve-workspace-ai-key")
  >("@/lib/ai/resolve-workspace-ai-key");
  return {
    ...actual,
    resolveWorkspaceAiKey: (...a: unknown[]) => resolveWorkspaceAiKey(...a),
  };
});

import { prisma } from "@/lib/prisma";
import { POST } from "../route";
import { readPhotoAiLatch } from "@/lib/anz/photo-ai-whs";

const HAS_DB = !!process.env.DATABASE_URL;
const S = `ra7618-${Date.now().toString(36)}`;

const NO_ACM_LABELS = {
  secondaryDamageIndicators: ["MOULD_VISIBLE"],
  roomType: "BATHROOM",
};

const ids = {
  userId: "",
  inspectionId: "",
  photoId: "",
};

describe.skipIf(!process.env.DATABASE_URL)(
  "POST /api/ai/auto-classify-photo/[photoId] ACM latch race (RA-7618)",
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

      const inspection = await prisma.inspection.create({
        data: {
          inspectionNumber: `${S}-insp`,
          propertyAddress: "1 Latch St",
          propertyPostcode: "4000",
          userId: user.id,
        },
      });
      ids.inspectionId = inspection.id;

      const photo = await prisma.inspectionPhoto.create({
        data: {
          inspectionId: inspection.id,
          url: "https://example.com/ra7618-latch.jpg",
          mimeType: "image/jpeg",
          affectedMaterial: [],
          secondaryDamageIndicators: [],
          metadata: {},
        },
      });
      ids.photoId = photo.id;

      getServerSession.mockResolvedValue({ user: { id: user.id } });
      resolveWorkspaceAiKey.mockResolvedValue({
        workspaceId: "ws-ra7618",
        apiKey: "test-anthropic-key",
      });
      autoClassifyPhoto.mockResolvedValue({
        ok: true,
        data: {
          labels: NO_ACM_LABELS,
          confidence: 0.8,
          model: "claude-sonnet-4.5",
        },
      });
    });

    afterAll(async () => {
      if (ids.inspectionId) {
        await prisma.inspectionPhoto.deleteMany({
          where: { inspectionId: ids.inspectionId },
        });
        await prisma.inspection.deleteMany({
          where: { id: ids.inspectionId },
        });
      }
      if (ids.userId) {
        await prisma.rateLimitHit.deleteMany({
          where: { key: { contains: ids.userId } },
        });
        await prisma.user.deleteMany({ where: { id: ids.userId } });
      }
    });

    it("keeps aiRaisedAcm after an overlapping no-ACM classify", async () => {
      expect(HAS_DB).toBe(true);

      let pending: Promise<Response> | undefined;

      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "InspectionPhoto" WHERE "id" = ${ids.photoId} FOR UPDATE`,
        );

        pending = POST(
          new NextRequest(
            `http://localhost/api/ai/auto-classify-photo/${ids.photoId}`,
            { method: "POST" },
          ),
          { params: Promise.resolve({ photoId: ids.photoId }) },
        );

        // Hold the row long enough for the route to reach its write
        // transaction, but well under Prisma's 5 s interactive timeout.
        await new Promise((resolve) => setTimeout(resolve, 800));

        await tx.inspectionPhoto.update({
          where: { id: ids.photoId },
          data: {
            metadata: {
              photoAi: { whsLatch: { aiRaisedAcm: true } },
            } as Prisma.InputJsonValue,
          },
        });
      });

      const res = await pending!;
      const body = await res.json();
      expect(res.status, JSON.stringify(body)).toBe(200);
      expect(autoClassifyPhoto).toHaveBeenCalledTimes(1);

      const row = await prisma.inspectionPhoto.findUnique({
        where: { id: ids.photoId },
        select: { metadata: true, aiLabels: true },
      });
      expect(readPhotoAiLatch(row?.metadata).aiRaisedAcm).toBe(true);
      // The classify write must have landed after T0; otherwise T0's raise
      // alone would make the latch assertion pass even if POST never ran.
      expect(row?.aiLabels).toMatchObject(NO_ACM_LABELS);
    });
  },
);
