/**
 * RA-8576 - confirm, under a row lock, which stale rooms are really empty.
 *
 * THE RACE
 * --------
 * Postgres runs at READ COMMITTED. A save that counted a room's dependents,
 * found none, and then deleted the room could be overtaken by a writer that
 * inserted a row against that room in between. The insert holds a
 * foreign-key lock on the room, so the delete waits for the writer to commit
 * - and then deletes the room anyway, because the delete's own condition
 * (the room's id) did not change. ON DELETE SET NULL then clears the link on
 * the writer's committed row.
 *
 * THE FIX
 * -------
 * The sketch route reads each stale room's dependents before its transaction.
 * That read can only say "not empty" for good: a room that held something
 * stays detached. A room that read empty is a deletion CANDIDATE, and this
 * confirms it inside the save's transaction: take the candidates' row locks
 * first (FOR UPDATE conflicts with the foreign-key lock any writer holds while
 * inserting), then count the dependents again. The count is a new statement,
 * so it sees everything committed while the lock was awaited. A candidate that
 * gained a dependent is detached instead. A writer that arrives after the lock
 * waits for the save to commit and, if the room was deleted, fails on the
 * foreign key rather than silently losing its link.
 *
 * Only candidates are locked, so a room that already holds evidence costs no
 * lock. Rooms are locked in id order so two saves touching the same rooms
 * cannot deadlock each other. This must run inside the caller's transaction.
 */
import { Prisma } from "@prisma/client";
import { partitionStaleRooms } from "./sync-room-graph";
import { SKETCH_ROOM_DEPENDENT_COUNT_SELECT } from "./room-dependents";

/** The slice of a Prisma transaction client this needs. */
interface RoomDb {
  $queryRaw: (query: Prisma.Sql) => Promise<unknown>;
  sketchRoom: {
    findMany: (args: unknown) => Promise<
      Array<{ id: string; _count?: Record<string, number | undefined> }>
    >;
  };
}

export async function confirmEmptyRooms(
  db: RoomDb,
  candidateIds: string[],
): Promise<{ deletableIds: string[]; detachableIds: string[] }> {
  if (candidateIds.length === 0) return { deletableIds: [], detachableIds: [] };

  const ids = [...new Set(candidateIds)].sort();
  let current: Array<{ id: string; _count?: Record<string, number | undefined> }>;
  try {
    // Lock first, count second. Both must stay inside the caller's transaction.
    await db.$queryRaw(
      Prisma.sql`SELECT "id" FROM "SketchRoom" WHERE "id" IN (${Prisma.join(
        ids,
      )}) ORDER BY "id" FOR UPDATE`,
    );
    current = await db.sketchRoom.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        _count: { select: SKETCH_ROOM_DEPENDENT_COUNT_SELECT },
      },
      // Bounded by the caller's own 500-room read.
      take: 500,
    });
  } catch (e) {
    throw new RoomLockError(e);
  }
  // A room another save already removed is simply absent here.
  return partitionStaleRooms(
    current.map((r) => ({ id: r.id, _count: r._count ?? {} })),
  );
}

/**
 * RA-8576: the lock or recount step failed. The sketch route treats most
 * room-graph failures as non-fatal (the drawing is already saved), which would
 * silently drop a room removal. It checks for this class to answer loudly
 * instead, after one retry when the failure was transient.
 */
export class RoomLockError extends Error {
  readonly transient: boolean;
  constructor(cause: unknown) {
    super(
      `stale-room lock or recount failed: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
    this.name = "RoomLockError";
    this.cause = cause;
    this.transient = isTransientDbFailure(cause);
  }
}

/** Deadlock, lock timeout, or an expired interactive transaction. */
export function isTransientDbFailure(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === "P2034" || code === "P2028") return true;
  const text = err instanceof Error ? err.message : String(err);
  return /deadlock detected|40P01|55P03|lock timeout|could not obtain lock/i.test(
    text,
  );
}
