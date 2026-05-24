/**
 * Punch-list P1 #11.2 — mirror-recovery subscriber.
 *
 * Sweeps `StorageMirrorJob.status = FAILED` rows where `attempts >= 5` and
 * promotes them to `DEAD_LETTER`, notifying every ADMIN user of the
 * owning Organization plus the owner. The sweep is idempotent: a row in
 * `DEAD_LETTER` status is never selected again, so re-running the cron
 * cannot double-notify.
 *
 * No retry magic — this subscriber *signals* dead-letters. Retry strategy
 * is a separate ticket (out of scope per Wave 2 brief).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { sweepDeadLetters, MIRROR_MAX_ATTEMPTS } from "../mirror-recovery";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    storageMirrorJob: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
    notification: {
      createMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";

const mockJobFindMany = vi.mocked(prisma.storageMirrorJob.findMany);
const mockJobUpdate = vi.mocked(prisma.storageMirrorJob.update);
const mockOrgFindUnique = vi.mocked(prisma.organization.findUnique);
const mockNotificationCreateMany = vi.mocked(prisma.notification.createMany);

beforeEach(() => {
  vi.clearAllMocks();
  mockJobUpdate.mockResolvedValue({} as never);
  // Default: notification.createMany echoes back the number of rows it was
  // asked to insert. Individual tests override when they care about counts.
  mockNotificationCreateMany.mockImplementation(
    async (args: unknown) =>
      ({
        count: ((args as { data?: unknown[] }).data ?? []).length,
      }) as never,
  );
});

describe("sweepDeadLetters", () => {
  it("promotes a FAILED job with attempts>=5 to DEAD_LETTER and notifies admins", async () => {
    mockJobFindMany.mockResolvedValue([
      {
        id: "job-1",
        orgId: "org-1",
        kind: "PHOTO",
        filename: "moisture-bedroom.jpg",
        attempts: 5,
        lastError: "Request timeout",
      },
    ] as never);
    // Prisma's `members.where: { role: "ADMIN" }` returns only admin rows;
    // the owner is added separately via `ownerId`.
    mockOrgFindUnique.mockResolvedValue({
      ownerId: "user-owner",
      members: [{ id: "user-admin", role: "ADMIN" }],
    } as never);

    const result = await sweepDeadLetters();

    expect(result).toEqual({ deadLettered: 1, notified: 2 });

    expect(mockJobUpdate).toHaveBeenCalledTimes(1);
    const updateArg = mockJobUpdate.mock.calls[0]![0];
    expect(updateArg.where).toEqual({ id: "job-1" });
    expect(updateArg.data.status).toBe("DEAD_LETTER");

    expect(mockNotificationCreateMany).toHaveBeenCalledTimes(1);
    const notifArg = mockNotificationCreateMany.mock.calls[0]![0];
    // One notification per admin (owner + ADMIN member), de-duped by userId.
    expect(notifArg.data).toHaveLength(2);
    const userIds = (notifArg.data as Array<{ userId: string }>)
      .map((d) => d.userId)
      .sort();
    expect(userIds).toEqual(["user-admin", "user-owner"]);
    expect((notifArg.data as Array<{ type: string }>)[0]!.type).toBe("ERROR");
  });

  it("is a no-op when no jobs match (attempts<5 or already DEAD_LETTER)", async () => {
    mockJobFindMany.mockResolvedValue([] as never);

    const result = await sweepDeadLetters();

    expect(result).toEqual({ deadLettered: 0, notified: 0 });
    expect(mockJobUpdate).not.toHaveBeenCalled();
    expect(mockNotificationCreateMany).not.toHaveBeenCalled();
    expect(mockOrgFindUnique).not.toHaveBeenCalled();
  });

  it("is idempotent — only selects rows in status=FAILED, never DEAD_LETTER", async () => {
    mockJobFindMany.mockResolvedValue([] as never);

    await sweepDeadLetters();

    // The query filter must constrain to status=FAILED + attempts>=MAX so a
    // second sweep cannot re-promote the same row.
    expect(mockJobFindMany).toHaveBeenCalledTimes(1);
    const where = mockJobFindMany.mock.calls[0]![0]!.where as {
      status: string;
      attempts: { gte: number };
    };
    expect(where.status).toBe("FAILED");
    expect(where.attempts).toEqual({ gte: MIRROR_MAX_ATTEMPTS });
    expect(MIRROR_MAX_ATTEMPTS).toBe(5);
  });

  it("writes one notification per admin when the org has three admins", async () => {
    mockJobFindMany.mockResolvedValue([
      {
        id: "job-multi",
        orgId: "org-1",
        kind: "REPORT",
        filename: "report.pdf",
        attempts: 7,
        lastError: "invalid_grant",
      },
    ] as never);
    // Prisma's `members.where: { role: "ADMIN" }` returns only the admin
    // rows; the owner is always notified via `org.ownerId` regardless of
    // their own row's role. Non-admin members (e.g. a "u-tech" USER) are
    // filtered out at the DB and never appear here.
    mockOrgFindUnique.mockResolvedValue({
      ownerId: "u-owner",
      members: [
        { id: "u-admin-1", role: "ADMIN" },
        { id: "u-admin-2", role: "ADMIN" },
      ],
    } as never);

    const result = await sweepDeadLetters();

    expect(result).toEqual({ deadLettered: 1, notified: 3 });
    expect(mockNotificationCreateMany).toHaveBeenCalledTimes(1);
    const notifArg = mockNotificationCreateMany.mock.calls[0]![0];
    expect(notifArg.data).toHaveLength(3);
    const userIds = (notifArg.data as Array<{ userId: string }>)
      .map((d) => d.userId)
      .sort();
    expect(userIds).toEqual(["u-admin-1", "u-admin-2", "u-owner"]);
  });

  it("skips a job whose owning org is missing — flips status anyway so we don't reselect", async () => {
    mockJobFindMany.mockResolvedValue([
      {
        id: "job-orphan",
        orgId: "org-ghost",
        kind: "PHOTO",
        filename: "p.jpg",
        attempts: 5,
        lastError: "x",
      },
    ] as never);
    mockOrgFindUnique.mockResolvedValue(null);

    const result = await sweepDeadLetters();

    expect(result).toEqual({ deadLettered: 1, notified: 0 });
    expect(mockJobUpdate).toHaveBeenCalledTimes(1);
    expect(mockNotificationCreateMany).not.toHaveBeenCalled();
  });
});
