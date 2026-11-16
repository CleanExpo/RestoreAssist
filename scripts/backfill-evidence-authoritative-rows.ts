/**
 * RA-8388 — owner-run backfill of the authoritative rows Guided Capture never wrote.
 *
 * Before this change the capture route wrote an `EvidenceItem` and nothing
 * else, while `validateSubmissionPayload` counts `MoistureReading`,
 * `EnvironmentalData` and `InspectionPhoto`. Every capture taken that way is
 * still invisible to the completion gate AFTER the fix deploys, so the job
 * stays blocked on evidence the technician can see in the evidence list. The
 * code fix stops new captures going missing; it recovers nothing already
 * taken. That is what this script is for.
 *
 * It derives each missing row through `deriveAuthoritativeRow` and
 * `photoRowPlan` — the SAME functions the route calls. Nothing here rebuilds
 * a row by hand: a backfill that writes its own idea of a row is a second
 * writer, and the point of this change was that two writers disagreed.
 *
 *   npx tsx scripts/backfill-evidence-authoritative-rows.ts --inspection <id>
 *   npx tsx scripts/backfill-evidence-authoritative-rows.ts --inspection <id> --apply
 *
 * Dry-run by default. `--inspection` is REQUIRED and there is no "all jobs"
 * mode: this writes into insurance evidence, and a flag that can sweep every
 * claim in the database is one mistyped command away from doing it.
 *
 * Running it against production data is the founder's decision. It is not
 * invoked from deploy, postinstall, CI or any workflow.
 *
 * Two things it deliberately does NOT do:
 *
 * 1. It never fills an old-shape reading. Captures from the legacy
 *    `evidence-capture-form` carry `{ measurementValue, measurementUnit }`
 *    and no material and no depth. `MoistureReading.surfaceType` and
 *    `.depth` are NOT NULL, and a guessed surface type inside an insurance
 *    record is worse than a missing row (AMENDMENT 02 F). Those are counted,
 *    listed and left alone for a person to recapture.
 *
 * 2. It never invalidates, edits or deletes an existing row. The only write
 *    is a create, and only where no matching row is already present.
 */

import { fileURLToPath } from "node:url";

import { prisma } from "@/lib/prisma";
import {
  deriveAuthoritativeRow,
  photoRowPlan,
  shouldWritePhotoRow,
  type AuthoritativeRowPlan,
} from "@/lib/evidence/authoritative-rows";
import { isMetadataEvidenceClass } from "@/lib/evidence/metadata-fields";

export const BACKFILL_PAGE = 5_000;

export class BackfillPageCapError extends Error {
  constructor(what: string) {
    super(
      `[ra-8388-backfill] ${what} hit the ${BACKFILL_PAGE} row cap for one inspection. Refusing to continue — no rows written.`,
    );
    this.name = "BackfillPageCapError";
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

/** One `EvidenceItem`, in the shape the planner needs. */
export interface BackfillEvidenceItem {
  id: string;
  inspectionId: string;
  evidenceClass: string;
  description: string | null;
  roomName: string | null;
  structuredData: string | null;
  capturedAt: Date;
  capturedLat: number | null;
  capturedLng: number | null;
  fileUrl: string | null;
  thumbnailUrl: string | null;
  fileMimeType: string | null;
  fileSizeBytes: number | null;
}

/**
 * The rows already in the authoritative tables for this inspection.
 *
 * There is no `evidenceItemId` column linking the two stores yet — that is a
 * migration the bench prescribed and the founder has not ruled on — so "is
 * this one already written?" is answered by VALUE, through the fingerprints
 * below. The failure direction is deliberate: a fingerprint collision means a
 * row is NOT written, which leaves a gate blocked and a person to look at it,
 * where the opposite error silently doubles a reading inside a claim file.
 */
export interface ExistingAuthoritativeRows {
  photoUrls: Set<string>;
  moistureFingerprints: Set<string>;
  environmentalFingerprints: Set<string>;
}

function isoOrNull(value: Date | string | null | undefined): string {
  if (!value) return "";
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

/**
 * ONE owner for each fingerprint, applied to the planned row AND to the
 * existing row. Two implementations of "the same reading" is exactly the
 * defect class this change already recorded: a rule that is copied drifts the
 * moment one copy is corrected.
 */
export function moistureFingerprint(row: {
  location: string;
  surfaceType: string;
  moistureLevel: number;
  depth: string;
  recordedAt?: Date | string | null;
}): string {
  return [
    row.location.trim(),
    row.surfaceType.trim(),
    String(row.moistureLevel),
    row.depth.trim(),
    isoOrNull(row.recordedAt),
  ].join("\u0000");
}

export function environmentalFingerprint(row: {
  location?: string | null;
  ambientTemperature: number;
  humidityLevel: number;
  recordedAt?: Date | string | null;
}): string {
  return [
    (row.location ?? "").trim(),
    String(row.ambientTemperature),
    String(row.humidityLevel),
    isoOrNull(row.recordedAt),
  ].join("\u0000");
}

export type BackfillDecision =
  | { kind: "write"; plan: AuthoritativeRowPlan }
  | { kind: "skip"; reason: "already-present" | "no-authoritative-table" }
  | {
      kind: "report";
      reason: "old-shape" | "unreadable-structured-data" | "photo-missing-url";
    }
  | { kind: "report"; reason: "incomplete"; missing: string[] };

function parseStructuredData(raw: string | null): {
  ok: boolean;
  value: unknown;
} {
  if (raw === null || raw.trim() === "") return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, value: null };
  }
}

/**
 * A capture from the legacy prompt-chain form.
 *
 * It carries a number and a unit and nothing else — no material, no depth.
 * Detected explicitly rather than letting `deriveAuthoritativeRow` report it
 * as "incomplete", because the two need different answers from a person: an
 * incomplete new-shape capture is a bug to look at, an old-shape one is a
 * reading that has to be taken again.
 */
export function isOldShapeMetadata(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const hasLegacy = "measurementValue" in record || "measurementUnit" in record;
  const hasCurrent =
    "surfaceType" in record || "depth" in record || "moistureLevel" in record;
  return hasLegacy && !hasCurrent;
}

/**
 * Decide what one evidence item needs. Pure: no database, no clock beyond the
 * `uploadedAt` the plan itself stamps.
 */
export function decideBackfill(
  item: BackfillEvidenceItem,
  existing: ExistingAuthoritativeRows,
): BackfillDecision {
  if (isMetadataEvidenceClass(item.evidenceClass)) {
    const parsed = parseStructuredData(item.structuredData);
    if (!parsed.ok) {
      return { kind: "report", reason: "unreadable-structured-data" };
    }
    if (isOldShapeMetadata(parsed.value)) {
      return { kind: "report", reason: "old-shape" };
    }

    const derived = deriveAuthoritativeRow(item.evidenceClass, parsed.value, {
      inspectionId: item.inspectionId,
      capturedAt: item.capturedAt,
      notes: item.description,
    });
    if (!derived.ok) {
      return { kind: "report", reason: "incomplete", missing: derived.missing };
    }
    if (derived.plan === null) {
      return { kind: "skip", reason: "no-authoritative-table" };
    }

    if (derived.plan.table === "moistureReading") {
      const fingerprint = moistureFingerprint({
        ...derived.plan.data,
        recordedAt: derived.plan.data.recordedAt ?? null,
      });
      return existing.moistureFingerprints.has(fingerprint)
        ? { kind: "skip", reason: "already-present" }
        : { kind: "write", plan: derived.plan };
    }

    const fingerprint = environmentalFingerprint({
      ...derived.plan.data,
      recordedAt: derived.plan.data.recordedAt ?? null,
    });
    return existing.environmentalFingerprints.has(fingerprint)
      ? { kind: "skip", reason: "already-present" }
      : { kind: "write", plan: derived.plan };
  }

  if (shouldWritePhotoRow(item.evidenceClass, item.fileMimeType)) {
    if (!item.fileUrl) {
      return { kind: "report", reason: "photo-missing-url" };
    }
    if (existing.photoUrls.has(item.fileUrl)) {
      return { kind: "skip", reason: "already-present" };
    }
    return {
      kind: "write",
      plan: photoRowPlan({
        inspectionId: item.inspectionId,
        url: item.fileUrl,
        thumbnailUrl: item.thumbnailUrl,
        description: item.description,
        location: item.roomName,
        capturedAt: item.capturedAt,
        fileSize: item.fileSizeBytes,
        mimeType: item.fileMimeType,
        gpsLatitude: item.capturedLat,
        gpsLongitude: item.capturedLng,
      }),
    };
  }

  return { kind: "skip", reason: "no-authoritative-table" };
}

export interface BackfillPlan {
  inspectionId: string;
  scanned: number;
  write: Array<{ evidenceItemId: string; plan: AuthoritativeRowPlan }>;
  alreadyPresent: number;
  noAuthoritativeTable: number;
  report: Array<{
    evidenceItemId: string;
    evidenceClass: string;
    reason: string;
    detail: string;
  }>;
}

/**
 * Plan the whole inspection in memory, writing nothing.
 *
 * Deliberately separate from the apply step so a dry run and the real run
 * decide identically, and so the decision logic is testable without a
 * database.
 */
export function planFromItems(
  inspectionId: string,
  items: BackfillEvidenceItem[],
  existing: ExistingAuthoritativeRows,
): BackfillPlan {
  const plan: BackfillPlan = {
    inspectionId,
    scanned: items.length,
    write: [],
    alreadyPresent: 0,
    noAuthoritativeTable: 0,
    report: [],
  };

  // A plan that would write two identical rows in one pass is the same
  // duplicate the fingerprint exists to stop, so the set grows as we go.
  const seen: ExistingAuthoritativeRows = {
    photoUrls: new Set(existing.photoUrls),
    moistureFingerprints: new Set(existing.moistureFingerprints),
    environmentalFingerprints: new Set(existing.environmentalFingerprints),
  };

  for (const item of items) {
    const decision = decideBackfill(item, seen);

    if (decision.kind === "skip") {
      if (decision.reason === "already-present") plan.alreadyPresent += 1;
      else plan.noAuthoritativeTable += 1;
      continue;
    }

    if (decision.kind === "report") {
      plan.report.push({
        evidenceItemId: item.id,
        evidenceClass: item.evidenceClass,
        reason: decision.reason,
        detail:
          decision.reason === "incomplete"
            ? decision.missing.join(", ")
            : decision.reason === "old-shape"
              ? "legacy measurementValue capture: no material, no depth — recapture required"
              : "",
      });
      continue;
    }

    plan.write.push({ evidenceItemId: item.id, plan: decision.plan });
    if (decision.plan.table === "inspectionPhoto") {
      seen.photoUrls.add(decision.plan.data.url);
    } else if (decision.plan.table === "moistureReading") {
      seen.moistureFingerprints.add(
        moistureFingerprint({
          ...decision.plan.data,
          recordedAt: decision.plan.data.recordedAt ?? null,
        }),
      );
    } else {
      seen.environmentalFingerprints.add(
        environmentalFingerprint({
          ...decision.plan.data,
          recordedAt: decision.plan.data.recordedAt ?? null,
        }),
      );
    }
  }

  return plan;
}

export async function loadExistingRows(
  inspectionId: string,
): Promise<ExistingAuthoritativeRows> {
  const [photos, moisture, environmental] = await Promise.all([
    prisma.inspectionPhoto.findMany({
      where: { inspectionId },
      select: { url: true },
      take: BACKFILL_PAGE,
    }),
    prisma.moistureReading.findMany({
      where: { inspectionId },
      select: {
        location: true,
        surfaceType: true,
        moistureLevel: true,
        depth: true,
        recordedAt: true,
      },
      take: BACKFILL_PAGE,
    }),
    prisma.environmentalData.findMany({
      where: { inspectionId },
      select: {
        location: true,
        ambientTemperature: true,
        humidityLevel: true,
        recordedAt: true,
      },
      take: BACKFILL_PAGE,
    }),
  ]);

  if (photos.length === BACKFILL_PAGE) {
    throw new BackfillPageCapError("InspectionPhoto");
  }
  if (moisture.length === BACKFILL_PAGE) {
    throw new BackfillPageCapError("MoistureReading");
  }
  if (environmental.length === BACKFILL_PAGE) {
    throw new BackfillPageCapError("EnvironmentalData");
  }

  return {
    photoUrls: new Set(photos.map((row) => row.url)),
    moistureFingerprints: new Set(moisture.map(moistureFingerprint)),
    environmentalFingerprints: new Set(
      environmental.map(environmentalFingerprint),
    ),
  };
}

export async function planInspectionBackfill(
  inspectionId: string,
): Promise<BackfillPlan> {
  const existing = await loadExistingRows(inspectionId);
  const items = await prisma.evidenceItem.findMany({
    where: { inspectionId, status: "ACTIVE" },
    select: {
      id: true,
      inspectionId: true,
      evidenceClass: true,
      description: true,
      roomName: true,
      structuredData: true,
      capturedAt: true,
      capturedLat: true,
      capturedLng: true,
      fileUrl: true,
      thumbnailUrl: true,
      fileMimeType: true,
      fileSizeBytes: true,
    },
    orderBy: { capturedAt: "asc" },
    take: BACKFILL_PAGE,
  });
  if (items.length === BACKFILL_PAGE) {
    throw new BackfillPageCapError("EvidenceItem");
  }

  return planFromItems(
    inspectionId,
    items.map((item) => ({
      ...item,
      evidenceClass: String(item.evidenceClass),
    })),
    existing,
  );
}

export async function applyInspectionBackfill(
  plan: BackfillPlan,
): Promise<number> {
  let written = 0;
  for (const row of plan.write) {
    switch (row.plan.table) {
      case "moistureReading":
        await prisma.moistureReading.create({ data: row.plan.data });
        break;
      case "environmentalData":
        await prisma.environmentalData.create({ data: row.plan.data });
        break;
      case "inspectionPhoto":
        await prisma.inspectionPhoto.create({ data: row.plan.data });
        break;
    }
    written += 1;
  }
  return written;
}

export function formatPlan(
  plan: BackfillPlan,
  written: number | null,
): string[] {
  const counts = {
    moistureReading: 0,
    environmentalData: 0,
    inspectionPhoto: 0,
  };
  for (const row of plan.write) counts[row.plan.table] += 1;

  const lines = [
    `[ra-8388-backfill] inspection: ${plan.inspectionId}`,
    `[ra-8388-backfill] evidence items scanned: ${plan.scanned}`,
    `[ra-8388-backfill] rows to write: ${plan.write.length} (moisture ${counts.moistureReading}, ambient ${counts.environmentalData}, photo ${counts.inspectionPhoto})`,
    `[ra-8388-backfill] already present (skipped): ${plan.alreadyPresent}`,
    `[ra-8388-backfill] no authoritative table (notes, equipment logs, documents): ${plan.noAuthoritativeTable}`,
    `[ra-8388-backfill] needs a person: ${plan.report.length}`,
  ];
  lines.push(
    written === null
      ? "[ra-8388-backfill] dry run — nothing written. Pass --apply to write."
      : `[ra-8388-backfill] rows written: ${written}`,
  );
  for (const row of plan.report) {
    lines.push(
      `  ${row.reason}\tevidence=${row.evidenceItemId}\tclass=${row.evidenceClass}\t${row.detail}`,
    );
  }
  return lines;
}

export function inspectionIdFromArgv(argv: string[]): string | null {
  const index = argv.indexOf("--inspection");
  if (index === -1) return null;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) return null;
  return value;
}

export async function runInspectionBackfill(
  argv: string[] = process.argv.slice(2),
  log: (line: string) => void = console.log,
): Promise<BackfillPlan | null> {
  const inspectionId = inspectionIdFromArgv(argv);
  if (!inspectionId) {
    log(
      "[ra-8388-backfill] --inspection <id> is required. This script writes into insurance evidence and has no all-jobs mode.",
    );
    return null;
  }

  const target = redactedDatabaseTarget();
  log(
    `[ra-8388-backfill] database host=${target.host} database=${target.database}`,
  );

  const plan = await planInspectionBackfill(inspectionId);
  const written = argv.includes("--apply")
    ? await applyInspectionBackfill(plan)
    : null;
  for (const line of formatPlan(plan, written)) log(line);
  return plan;
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  runInspectionBackfill()
    .then(() => prisma.$disconnect())
    .catch(async (error) => {
      console.error("[ra-8388-backfill] failed:", error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
