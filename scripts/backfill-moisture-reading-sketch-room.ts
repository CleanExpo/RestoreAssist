/**
 * RA-7610 — owner-run backfill of MoistureReading.sketchRoomId.
 *
 * Matches existing readings' free-text `location` to SketchRoom names on the
 * same job. Only an exact, single, unambiguous match is assigned. Several
 * rooms, a partial match, or no match leaves sketchRoomId null and is listed
 * for a person to confirm.
 *
 * Dry-run by default (prints counts and the confirmation list). Writes only
 * with `--apply`. Idempotent: a reading that already has sketchRoomId is
 * skipped. This script is NOT invoked from deploy, postinstall, or any
 * workflow — the owner runs it.
 *
 *   npx tsx scripts/backfill-moisture-reading-sketch-room.ts
 *   npx tsx scripts/backfill-moisture-reading-sketch-room.ts --apply
 */

import { fileURLToPath } from "node:url";
import { prisma } from "@/lib/prisma";

export const BACKFILL_ROOM_PAGE = 5_000;
const PAGE = BACKFILL_ROOM_PAGE;

export class BackfillRoomCapError extends Error {
  constructor() {
    super(
      `[ra-7610-backfill] SketchRoom fetch hit the ${BACKFILL_ROOM_PAGE} row cap. Refusing to continue — paginate or raise the limit. No rows written.`,
    );
    this.name = "BackfillRoomCapError";
  }
}

export function redactedDatabaseTarget(
  connectionString = process.env.DATABASE_URL,
): { host: string; database: string } {
  if (!connectionString) {
    return { host: "(unset)", database: "(unset)" };
  }
  try {
    const parsed = new URL(connectionString);
    const database =
      decodeURIComponent(parsed.pathname.replace(/^\//, "")) || "(none)";
    return { host: parsed.hostname || "(unknown)", database };
  } catch {
    return { host: "(unparseable)", database: "(unparseable)" };
  }
}

export type BackfillReading = {
  id: string;
  inspectionId: string;
  location: string;
  sketchRoomId: string | null;
};

export type BackfillRoom = {
  id: string;
  name: string;
  inspectionId: string;
};

export type MatchResult =
  | { kind: "assign"; sketchRoomId: string }
  | {
      kind: "confirm";
      reason: "ambiguous" | "partial" | "none";
      sketchRoomId: null;
      candidateIds: string[];
    }
  | { kind: "skip"; reason: "already-linked" };

function trimmed(value: string): string {
  return value.trim();
}

function isExactName(location: string, roomName: string): boolean {
  return trimmed(location) === trimmed(roomName);
}

function isPartialName(location: string, roomName: string): boolean {
  const loc = trimmed(location).toLowerCase();
  const room = trimmed(roomName).toLowerCase();
  if (!loc || !room || loc === room) return false;
  return loc.includes(room) || room.includes(loc);
}

export function classifyMoistureReadingRoomMatch(
  reading: BackfillReading,
  roomsOnSameJob: BackfillRoom[],
): MatchResult {
  if (reading.sketchRoomId) {
    return { kind: "skip", reason: "already-linked" };
  }

  const sameJob = roomsOnSameJob.filter(
    (room) => room.inspectionId === reading.inspectionId,
  );
  const exact = sameJob.filter((room) =>
    isExactName(reading.location, room.name),
  );
  if (exact.length === 1) {
    return { kind: "assign", sketchRoomId: exact[0].id };
  }
  if (exact.length > 1) {
    return {
      kind: "confirm",
      reason: "ambiguous",
      sketchRoomId: null,
      candidateIds: exact.map((room) => room.id),
    };
  }

  const partial = sameJob.filter((room) =>
    isPartialName(reading.location, room.name),
  );
  if (partial.length > 0) {
    return {
      kind: "confirm",
      reason: "partial",
      sketchRoomId: null,
      candidateIds: partial.map((room) => room.id),
    };
  }

  return {
    kind: "confirm",
    reason: "none",
    sketchRoomId: null,
    candidateIds: [],
  };
}

export type BackfillPlan = {
  assign: Array<{ readingId: string; sketchRoomId: string; location: string }>;
  confirm: Array<{
    readingId: string;
    inspectionId: string;
    location: string;
    reason: "ambiguous" | "partial" | "none";
    candidateIds: string[];
  }>;
  skippedAlreadyLinked: number;
  readingsScanned: number;
};

export async function planMoistureReadingSketchRoomBackfill(): Promise<BackfillPlan> {
  const plan: BackfillPlan = {
    assign: [],
    confirm: [],
    skippedAlreadyLinked: 0,
    readingsScanned: 0,
  };

  const rooms = await prisma.sketchRoom.findMany({
    where: { detachedAt: null },
    select: {
      id: true,
      name: true,
      sketch: { select: { inspectionId: true } },
    },
    take: PAGE,
  });
  if (rooms.length === PAGE) {
    throw new BackfillRoomCapError();
  }

  const roomsByInspection = new Map<string, BackfillRoom[]>();
  for (const room of rooms) {
    const inspectionId = room.sketch.inspectionId;
    const list = roomsByInspection.get(inspectionId) ?? [];
    list.push({ id: room.id, name: room.name, inspectionId });
    roomsByInspection.set(inspectionId, list);
  }

  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.moistureReading.findMany({
      select: {
        id: true,
        inspectionId: true,
        location: true,
        sketchRoomId: true,
      },
      orderBy: { id: "asc" },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (batch.length === 0) break;
    plan.readingsScanned += batch.length;
    cursor = batch[batch.length - 1].id;

    for (const reading of batch) {
      const result = classifyMoistureReadingRoomMatch(
        reading,
        roomsByInspection.get(reading.inspectionId) ?? [],
      );
      if (result.kind === "skip") {
        plan.skippedAlreadyLinked += 1;
        continue;
      }
      if (result.kind === "assign") {
        plan.assign.push({
          readingId: reading.id,
          sketchRoomId: result.sketchRoomId,
          location: reading.location,
        });
        continue;
      }
      plan.confirm.push({
        readingId: reading.id,
        inspectionId: reading.inspectionId,
        location: reading.location,
        reason: result.reason,
        candidateIds: result.candidateIds,
      });
    }

    if (batch.length < PAGE) break;
  }

  return plan;
}

export async function applyMoistureReadingSketchRoomBackfill(
  plan: BackfillPlan,
): Promise<number> {
  let written = 0;
  for (const row of plan.assign) {
    const updated = await prisma.moistureReading.updateMany({
      where: { id: row.readingId, sketchRoomId: null },
      data: { sketchRoomId: row.sketchRoomId },
    });
    written += updated.count;
  }
  return written;
}

function printPlan(plan: BackfillPlan, written: number | null): void {
  console.log("[ra-7610-backfill] readings scanned:", plan.readingsScanned);
  console.log("[ra-7610-backfill] exact unique matches to assign:", plan.assign.length);
  console.log(
    "[ra-7610-backfill] already linked (skipped):",
    plan.skippedAlreadyLinked,
  );
  console.log(
    "[ra-7610-backfill] listed for confirmation:",
    plan.confirm.length,
  );
  if (written !== null) {
    console.log("[ra-7610-backfill] rows written:", written);
  } else {
    console.log("[ra-7610-backfill] dry-run — no rows written. Pass --apply to write.");
  }
  if (plan.confirm.length === 0) return;
  console.log("[ra-7610-backfill] confirmation list:");
  for (const row of plan.confirm) {
    console.log(
      `  ${row.reason}\tjob=${row.inspectionId}\treading=${row.readingId}\tlocation=${JSON.stringify(row.location)}\tcandidates=${row.candidateIds.join(",") || "-"}`,
    );
  }
}

export async function runMoistureReadingSketchRoomBackfill(
  argv: string[] = process.argv.slice(2),
): Promise<BackfillPlan> {
  const target = redactedDatabaseTarget();
  console.log(
    `[ra-7610-backfill] database host=${target.host} database=${target.database}`,
  );
  const apply = argv.includes("--apply");
  const plan = await planMoistureReadingSketchRoomBackfill();
  const written = apply
    ? await applyMoistureReadingSketchRoomBackfill(plan)
    : null;
  printPlan(plan, written);
  return plan;
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  runMoistureReadingSketchRoomBackfill()
    .then(() => prisma.$disconnect())
    .catch(async (error) => {
      console.error("[ra-7610-backfill] failed:", error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
