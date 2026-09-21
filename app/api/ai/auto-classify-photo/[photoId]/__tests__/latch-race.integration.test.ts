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
 * The waiter is `pg_stat_activity`, not a sleep. A fixed 800 ms pause can
 * let the mutant pass vacuously: the route's three real round-trips
 * (subscription, rate-limit, ownership findFirst) may exceed 800 ms on a
 * slow CI runner, T0 commits first, and the mutant then reads the
 * committed `true`. Both arms block on T0's row lock — FOR UPDATE with
 * the fix, UPDATE without it — so the same poll is the barrier.
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

const LOCK_WAIT_POLL_MS = 25;
const LOCK_WAIT_DEADLINE_MS = 4_000;

/**
 * Poll from a pool connection that is not T0 until another backend is
 * waiting on a lock whose current query names InspectionPhoto.
 *
 * Returns elapsed milliseconds so the evidence log can show the wait
 * was observed rather than assumed.
 */
async function waitForInspectionPhotoLockWaiter(t0Pid: number): Promise<number> {
  const started = Date.now();
  while (true) {
    const waiters = await prisma.$queryRaw<Array<{ pid: number | bigint }>>(
      Prisma.sql`
        SELECT pid
        FROM pg_stat_activity
        WHERE pid <> ${t0Pid}
          AND wait_event_type = 'Lock'
          AND query ILIKE '%InspectionPhoto%'
        LIMIT 1
      `,
    );
    if (waiters.length > 0) {
      return Date.now() - started;
    }
    if (Date.now() - started >= LOCK_WAIT_DEADLINE_MS) {
      throw new Error(
        `RA-7618: no pg_stat_activity Lock waiter on InspectionPhoto within ${LOCK_WAIT_DEADLINE_MS}ms (T0 pid ${t0Pid})`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, LOCK_WAIT_POLL_MS));
  }
}

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

      // timeout > 4 s poll + write. The route's own interactive transaction
      // stays on Prisma's 5 s default; we commit as soon as the waiter appears.
      await prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw(
            Prisma.sql`SELECT "id" FROM "InspectionPhoto" WHERE "id" = ${ids.photoId} FOR UPDATE`,
          );
          const pidRows = await tx.$queryRaw<Array<{ pid: number | bigint }>>(
            Prisma.sql`SELECT pg_backend_pid() AS pid`,
          );
          const t0Pid = Number(pidRows[0]?.pid);
          expect(t0Pid).toBeGreaterThan(0);

          pending = POST(
            new NextRequest(
              `http://localhost/api/ai/auto-classify-photo/${ids.photoId}`,
              { method: "POST" },
            ),
            { params: Promise.resolve({ photoId: ids.photoId }) },
          );

          const lockWaitMs = await waitForInspectionPhotoLockWaiter(t0Pid);
          console.log(
            `[RA-7618] InspectionPhoto lock waiter observed after ${lockWaitMs}ms (T0 pid ${t0Pid})`,
          );

          await tx.inspectionPhoto.update({
            where: { id: ids.photoId },
            data: {
              metadata: {
                photoAi: { whsLatch: { aiRaisedAcm: true } },
              } as Prisma.InputJsonValue,
            },
          });
        },
        { timeout: 15_000 },
      );

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
