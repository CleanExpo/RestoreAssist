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
  // Lock first, count second. Both must stay inside the caller's transaction.
  await db.$queryRaw(
    Prisma.sql`SELECT "id" FROM "SketchRoom" WHERE "id" IN (${Prisma.join(
      ids,
    )}) ORDER BY "id" FOR UPDATE`,
  );
  const current = await db.sketchRoom.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      _count: { select: SKETCH_ROOM_DEPENDENT_COUNT_SELECT },
    },
    // Bounded by the caller's own 500-room read.
    take: 500,
  });
  // A room another save already removed is simply absent here.
  return partitionStaleRooms(
    current.map((r) => ({ id: r.id, _count: r._count ?? {} })),
  );
}
