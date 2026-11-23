/**
 * RA-8576 - confirmEmptyRooms takes the candidates' row locks BEFORE it counts
 * their dependents, and counts again rather than trusting an earlier read.
 * The real interleaving is proved on Postgres in
 * app/api/inspections/[id]/sketches/__tests__/room-link-race.integration.test.ts;
 * this pins the order of the calls so the lock cannot be dropped or moved
 * after the count without a failing test on every machine, not just where a
 * database is available.
 */
import { describe, expect, it, vi } from "vitest";
import { confirmEmptyRooms, RoomLockError } from "../reconcile-stale-rooms";

function fakeDb(counts: Record<string, Record<string, number>>) {
  const calls: string[] = [];
  const db = {
    $queryRaw: vi.fn(async (q: { sql?: string; strings?: string[] }) => {
      const text = q.sql ?? q.strings?.join("?") ?? "";
      calls.push(/FOR UPDATE/.test(text) ? "lock" : "raw");
      return [];
    }),
    sketchRoom: {
      findMany: vi.fn(async (args: { where: { id: { in: string[] } } }) => {
        calls.push("count");
        return args.where.id.in
          .filter((id) => id in counts)
          .map((id) => ({ id, _count: counts[id] }));
      }),
    },
  };
  return { db, calls };
}

describe("confirmEmptyRooms", () => {
  it("locks, then counts, and confirms a room that is still empty", async () => {
    const { db, calls } = fakeDb({ r1: { evidencePins: 0 } });
    const out = await confirmEmptyRooms(db, ["r1"]);
    expect(calls).toEqual(["lock", "count"]);
    expect(out).toEqual({ deletableIds: ["r1"], detachableIds: [] });
  });

  it("detaches a candidate that gained a dependent after the first read", async () => {
    // The caller's earlier read said empty; the count under the lock says
    // otherwise. The fresh count wins.
    const { db } = fakeDb({ r1: { roomObservations: 1 } });
    const out = await confirmEmptyRooms(db, ["r1"]);
    expect(out).toEqual({ deletableIds: [], detachableIds: ["r1"] });
  });

  it("counts a dependent table the schema gains later", async () => {
    const { db } = fakeDb({ r1: { someFutureTable: 2 } });
    const out = await confirmEmptyRooms(db, ["r1"]);
    expect(out.detachableIds).toEqual(["r1"]);
  });

  it("asks the database to count every dependent relation", async () => {
    const { db } = fakeDb({ r1: {} });
    await confirmEmptyRooms(db, ["r1"]);
    const args = db.sketchRoom.findMany.mock.calls[0][0] as {
      select: { _count: { select: Record<string, boolean> } };
    };
    expect(Object.keys(args.select._count.select)).toContain("roomObservations");
  });

  it("locks rooms in id order so two saves cannot deadlock", async () => {
    const { db } = fakeDb({ a: {}, b: {}, c: {} });
    await confirmEmptyRooms(db, ["c", "a", "b"]);
    const findArgs = db.sketchRoom.findMany.mock.calls[0][0];
    expect(findArgs.where.id.in).toEqual(["a", "b", "c"]);
  });

  it("skips a room another save already removed", async () => {
    const { db } = fakeDb({ r2: {} });
    const out = await confirmEmptyRooms(db, ["r1", "r2"]);
    expect(out.deletableIds).toEqual(["r2"]);
    expect(out.detachableIds).toEqual([]);
  });

  it("takes no lock and runs no query when nothing is a candidate", async () => {
    const { db, calls } = fakeDb({});
    const out = await confirmEmptyRooms(db, []);
    expect(calls).toEqual([]);
    expect(out).toEqual({ deletableIds: [], detachableIds: [] });
  });
});

describe("confirmEmptyRooms failures (RA-8576)", () => {
  it("wraps a failed lock in RoomLockError so the route cannot swallow it", async () => {
    const { db } = fakeDb({ r1: {} });
    db.$queryRaw.mockRejectedValueOnce(new Error("connection reset"));
    const err = await confirmEmptyRooms(db, ["r1"]).catch((e) => e);
    expect(err).toBeInstanceOf(RoomLockError);
    expect(err.transient).toBe(false);
  });

  it.each([
    ["a deadlock", new Error("deadlock detected")],
    ["a lock timeout", new Error("canceling statement due to lock timeout")],
    ["an expired transaction", Object.assign(new Error("x"), { code: "P2028" })],
    ["a write conflict", Object.assign(new Error("x"), { code: "P2034" })],
  ])("marks %s as transient", async (_label, cause) => {
    const { db } = fakeDb({ r1: {} });
    db.$queryRaw.mockRejectedValueOnce(cause);
    const err = await confirmEmptyRooms(db, ["r1"]).catch((e) => e);
    expect(err.transient).toBe(true);
  });

  it("wraps a failed recount too", async () => {
    const { db } = fakeDb({ r1: {} });
    db.sketchRoom.findMany.mockRejectedValueOnce(new Error("db down"));
    const err = await confirmEmptyRooms(db, ["r1"]).catch((e) => e);
    expect(err).toBeInstanceOf(RoomLockError);
  });
});
