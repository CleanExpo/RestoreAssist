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
 *   npx tsx scripts/backfill-evidence-authoritative-rows.ts --inspection <id or job number>
 *   npx tsx scripts/backfill-evidence-authoritative-rows.ts --inspection <id or job number> --apply --expect-plan <digest>
 *
 * Dry-run by default. `--inspection` is REQUIRED and there is no "all jobs"
 * mode: this writes into insurance evidence, and a flag that can sweep every
 * claim in the database is one mistyped command away from doing it.
 *
 * Release preconditions built into the command (RA-8388 bench round 1):
 *
 * - `--inspection` takes the internal id OR the job number a person actually
 *   has (`inspectionNumber`, for example NIR-2026-11-B3F306). It is looked
 *   up first, and an inspection that does not exist is a FAILURE with a
 *   non-zero exit, as is a missing `--inspection`. Neither may read as "a
 *   clean run with nothing to do".
 * - The dry run prints a sha256 digest of the planned writes. `--apply`
 *   refuses to write unless `--expect-plan` carries the digest of the plan
 *   it is about to write, so the run that writes is the run a person read.
 * - Every created row is printed as it is written (table, new row id, source
 *   evidence id). That list is the only record of what a run wrote into
 *   `InspectionPhoto`, which has no link column: keep it with the release
 *   record.
 * - The evidence and the existing rows are read in one repeatable-read
 *   snapshot, so a capture landing mid-plan cannot be half seen.
 * - A photograph promoted from the client portal is never counted (founder
 *   ruling 16/11/2026) and is listed under its own reason.
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
 *
 * AMENDMENT 05: every reading it writes carries `evidenceItemId`, the link to
 * the evidence record it was derived from, through `linkPlanToEvidence` - the
 * same function the capture route calls. So this script needs migration
 * 20261116120000_ra_8388_evidence_link_and_duplicate_guard applied first; on
 * a database without it every query here fails on the missing column, loudly
 * and before anything is written.
 */

import { createHash } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { disconnectCliPrisma } from "./cli-prisma";
import {
  deriveAuthoritativeRow,
  linkPlanToEvidence,
  photoCountDecision,
  photoRowPlan,
  type AuthoritativeRowPlan,
  type AuthoritativeTable,
} from "@/lib/evidence/authoritative-rows";
import { isMetadataEvidenceClass } from "@/lib/evidence/metadata-fields";
import { DOWNGRADE_REASON_CLIENT_PORTAL_PROMOTION } from "@/lib/evidence/signing-policy";

export const BACKFILL_PAGE = 5_000;

/**
 * The limits on the snapshot read. Stated, because Prisma's defaults (2
 * seconds to get a connection, 5 seconds to run) would abort a plan over a
 * large job part way through its reads.
 */
const SNAPSHOT_TRANSACTION_OPTIONS = {
  isolationLevel: "RepeatableRead",
  maxWait: 20_000,
  timeout: 120_000,
} as const;

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
  /**
   * A `ClientEvidenceSubmission` on the same inspection has this file URL:
   * the file came in through the client portal. Set by the loader from the
   * snapshot. This is the half of "client-promoted" that covers promotions
   * made before the downgrade marker existed (before 26/07/2026), which
   * carry nothing in `structuredData` to say where they came from.
   */
  matchesClientSubmission: boolean;
}

/**
 * Whether a stored record carries the mark promote-client stamps on every
 * record it writes.
 *
 * The value is imported from the signing policy, its one owner. The KEY it
 * is stored under is written by `buildEvidenceStructuredData`
 * (lib/evidence/structured-data.ts, `signedManifestDowngradeReason`); the
 * test for this script builds its fixture through that function, so a
 * renamed key fails here instead of quietly counting client photographs.
 */
function carriesClientPromotionMarker(structuredData: unknown): boolean {
  return (
    !!structuredData &&
    typeof structuredData === "object" &&
    (structuredData as Record<string, unknown>).signedManifestDowngradeReason ===
      DOWNGRADE_REASON_CLIENT_PORTAL_PROMOTION
  );
}

/**
 * The rows already in the authoritative tables for this inspection.
 *
 * "Is this one already written?" is answered in two steps, in this order.
 *
 * 1. BY LINK (AMENDMENT 05). A reading whose `evidenceItemId` is this
 *    evidence record is this record's row. That is exact, and it is the only
 *    answer available for a row another screen has since given a different
 *    pin or room.
 *
 * 2. BY VALUE, through the fingerprints below, for everything the link cannot
 *    answer: rows written before the link existed, and photos, which have no
 *    link column. The failure direction is deliberate: a fingerprint
 *    collision means a row is NOT written, which leaves a gate blocked and a
 *    person to look at it, where the opposite error silently doubles a
 *    reading inside a claim file. The fingerprints cover linked rows too, on
 *    purpose: a second evidence record with the same values at the same
 *    instant as a linked reading is a repeated submission, not a second
 *    reading.
 */
export interface ExistingAuthoritativeRows {
  /** Evidence records that already have a linked reading in either table. */
  linkedEvidenceIds: Set<string>;
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
      reason:
        | "old-shape"
        | "unreadable-structured-data"
        | "photo-missing-url"
        // Founder ruling 16/11/2026: evidence, never a counted photograph.
        | "client-promoted"
        // A photograph class whose stored file is not an image.
        | "photo-not-image-type";
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
    // By link first. It is exact, and it must come before anything that can
    // fail: a record whose row is already written is done, whatever shape
    // its payload is in.
    if (existing.linkedEvidenceIds.has(item.id)) {
      return { kind: "skip", reason: "already-present" };
    }
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
        : { kind: "write", plan: linkPlanToEvidence(derived.plan, item.id) };
    }

    // `deriveAuthoritativeRow` only ever plans a reading. Said out loud so
    // the compiler checks the columns below against EnvironmentalData and
    // not against "whatever is left of the union". (`scripts/**` is outside
    // the project's tsc run, so this had never been type-checked.)
    if (derived.plan.table !== "environmentalData") {
      return { kind: "skip", reason: "no-authoritative-table" };
    }

    const fingerprint = environmentalFingerprint({
      ...derived.plan.data,
      recordedAt: derived.plan.data.recordedAt ?? null,
    });
    return existing.environmentalFingerprints.has(fingerprint)
      ? { kind: "skip", reason: "already-present" }
      : { kind: "write", plan: linkPlanToEvidence(derived.plan, item.id) };
  }

  // THE photograph rule, the same call the capture route makes. This script
  // supplies the one input the route never needs to compute: whether the
  // record was promoted from the client portal. Either signal is enough.
  const provenance = parseStructuredData(item.structuredData);
  const photo = photoCountDecision({
    evidenceClass: item.evidenceClass,
    mimeType: item.fileMimeType,
    clientPromoted:
      item.matchesClientSubmission ||
      (provenance.ok && carriesClientPromotionMarker(provenance.value)),
  });

  if (!photo.counts && photo.reason === "not-a-photograph-class") {
    return { kind: "skip", reason: "no-authoritative-table" };
  }
  // From here the record IS a photograph class, so every outcome that is
  // not a write is listed for a person. Folding one into "no authoritative
  // table" is the invisible non-count this change exists to remove.
  if (!photo.counts && photo.reason === "client-promoted") {
    return { kind: "report", reason: "client-promoted" };
  }
  if (!provenance.ok) {
    // Where it came from is written in structured data this script cannot
    // read. Not being able to see the promotion marker is not the same as
    // there being none, so it is not assumed to be the technician's.
    return { kind: "report", reason: "unreadable-structured-data" };
  }
  if (!photo.counts) {
    return { kind: "report", reason: "photo-not-image-type" };
  }

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

const REPORT_DETAIL: Record<string, string> = {
  "old-shape":
    "legacy measurementValue capture: no material, no depth — recapture required",
  "client-promoted":
    "sent by the client through the portal: kept as evidence, never counted as a photograph",
  "photo-not-image-type":
    "photograph class whose stored file type is not an image: not counted, check the file",
};

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
    linkedEvidenceIds: new Set(existing.linkedEvidenceIds),
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
            : (REPORT_DETAIL[decision.reason] ?? ""),
      });
      continue;
    }

    plan.write.push({ evidenceItemId: item.id, plan: decision.plan });
    if (decision.plan.table === "inspectionPhoto") {
      seen.photoUrls.add(decision.plan.data.url);
    } else if (decision.plan.table === "moistureReading") {
      seen.linkedEvidenceIds.add(item.id);
      seen.moistureFingerprints.add(
        moistureFingerprint({
          ...decision.plan.data,
          recordedAt: decision.plan.data.recordedAt ?? null,
        }),
      );
    } else {
      seen.linkedEvidenceIds.add(item.id);
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

/** Any client the reads can run on. In practice: the snapshot transaction. */
type ReadClient = Prisma.TransactionClient;

export async function loadExistingRows(
  inspectionId: string,
  client: ReadClient,
): Promise<ExistingAuthoritativeRows> {
  const photos = await client.inspectionPhoto.findMany({
    where: { inspectionId },
    select: { url: true },
    take: BACKFILL_PAGE,
  });
  const moisture = await client.moistureReading.findMany({
    where: { inspectionId },
    select: {
      location: true,
      surfaceType: true,
      moistureLevel: true,
      depth: true,
      recordedAt: true,
      evidenceItemId: true,
    },
    take: BACKFILL_PAGE,
  });
  const environmental = await client.environmentalData.findMany({
    where: { inspectionId },
    select: {
      evidenceItemId: true,
      location: true,
      ambientTemperature: true,
      humidityLevel: true,
      recordedAt: true,
    },
    take: BACKFILL_PAGE,
  });

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
    linkedEvidenceIds: new Set(
      [...moisture, ...environmental].flatMap((row) =>
        row.evidenceItemId ? [row.evidenceItemId] : [],
      ),
    ),
    photoUrls: new Set(photos.map((row) => row.url)),
    moistureFingerprints: new Set(moisture.map(moistureFingerprint)),
    environmentalFingerprints: new Set(
      environmental.map(environmentalFingerprint),
    ),
  };
}

/**
 * The file URL of every portal submission on this inspection.
 *
 * Capped like every other read here, and for a sharper reason: a list cut
 * off at the cap would let a client's photograph past the join and into the
 * counted photographs. A truncated read refuses the whole plan.
 */
async function loadClientSubmissionFileUrls(
  inspectionId: string,
  client: ReadClient,
): Promise<Set<string>> {
  const submissions = await client.clientEvidenceSubmission.findMany({
    where: { inspectionId, fileUrl: { not: null } },
    select: { fileUrl: true },
    take: BACKFILL_PAGE,
  });
  if (submissions.length === BACKFILL_PAGE) {
    throw new BackfillPageCapError("ClientEvidenceSubmission");
  }
  return new Set(
    submissions.flatMap((row) => (row.fileUrl ? [row.fileUrl] : [])),
  );
}

/**
 * Read everything the plan is built from in ONE repeatable-read snapshot.
 *
 * It used to read the existing rows first and the evidence second, on two
 * separate statements. A capture landing between them was seen as evidence
 * with no photo row, so the plan wrote a second row for a photograph the
 * route had already counted; `InspectionPhoto` has no unique key to refuse
 * it. One snapshot means the evidence, the rows already written and the
 * portal submissions all describe the same instant.
 *
 * `inspectionId` is the INTERNAL id. The command resolves a job number to
 * it before calling this.
 */
export async function planInspectionBackfill(
  inspectionId: string,
): Promise<BackfillPlan> {
  const snapshot = await prisma.$transaction(async (tx) => {
    const items = await tx.evidenceItem.findMany({
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
    const clientSubmissionFileUrls = await loadClientSubmissionFileUrls(
      inspectionId,
      tx,
    );
    const existing = await loadExistingRows(inspectionId, tx);
    return { items, clientSubmissionFileUrls, existing };
  }, SNAPSHOT_TRANSACTION_OPTIONS);

  return planFromItems(
    inspectionId,
    snapshot.items.map((item) => ({
      ...item,
      evidenceClass: String(item.evidenceClass),
      matchesClientSubmission:
        item.fileUrl !== null &&
        snapshot.clientSubmissionFileUrls.has(item.fileUrl),
    })),
    snapshot.existing,
  );
}

/** One row a run created: what a person needs to undo exactly that run. */
export interface CreatedRow {
  table: AuthoritativeTable;
  /** The NEW row's id in `table`. */
  id: string;
  /** The evidence record it was derived from. */
  evidenceItemId: string;
}

export function formatCreatedRow(row: CreatedRow): string {
  return `[ra-8388-backfill] created\ttable=${row.table}\tid=${row.id}\tevidence=${row.evidenceItemId}`;
}

/**
 * Write the planned rows, reporting each one AS it is written.
 *
 * The id every create returns used to be thrown away and only a count was
 * printed, after the last row. `InspectionPhoto` has no column pointing back
 * at its evidence record, so that count was the whole record of what a run
 * had added to a claim file, and a run that failed on row 7 of 12 printed
 * nothing at all about the first six. Each line is logged before the next
 * create starts, so a partial run leaves its trail.
 */
export async function applyInspectionBackfill(
  plan: BackfillPlan,
  log: (line: string) => void = () => {},
): Promise<CreatedRow[]> {
  const created: CreatedRow[] = [];
  for (const row of plan.write) {
    let id: string;
    switch (row.plan.table) {
      case "moistureReading":
        id = (
          await prisma.moistureReading.create({
            data: row.plan.data,
            select: { id: true },
          })
        ).id;
        break;
      case "environmentalData":
        id = (
          await prisma.environmentalData.create({
            data: row.plan.data,
            select: { id: true },
          })
        ).id;
        break;
      case "inspectionPhoto":
        id = (
          await prisma.inspectionPhoto.create({
            data: row.plan.data,
            select: { id: true },
          })
        ).id;
        break;
    }
    const entry: CreatedRow = {
      table: row.plan.table,
      id,
      evidenceItemId: row.evidenceItemId,
    };
    created.push(entry);
    log(formatCreatedRow(entry));
  }
  return created;
}

/** JSON with object keys in a fixed order and dates as ISO strings. */
function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] !== undefined) out[key] = canonical(source[key]);
    }
    return out;
  }
  return value;
}

/**
 * A sha256 over exactly what `--apply` would write.
 *
 * `--apply` builds a FRESH plan from live data; it does not replay the dry
 * run. On a job still taking captures, the plan a person read and the plan
 * that gets written can differ and nothing said so. The digest covers the
 * inspection, and for every planned row its table, its source evidence id
 * and every column value, in a fixed order, so any difference between the
 * two plans changes it.
 *
 * `uploadedAt` is left out on purpose: the photo plan stamps it with the
 * clock at plan time, so it differs on every run and is not something a
 * person approved.
 */
export function planDigest(plan: BackfillPlan): string {
  const rows = plan.write
    .map((row) => {
      const { uploadedAt: _stampedAtPlanTime, ...data } = row.plan
        .data as Record<string, unknown>;
      return JSON.stringify([
        row.plan.table,
        row.evidenceItemId,
        canonical(data),
      ]);
    })
    .sort();
  return createHash("sha256")
    .update(JSON.stringify({ inspectionId: plan.inspectionId, rows }))
    .digest("hex");
}

/**
 * The printed plan.
 *
 * `outcome` is the line that says what happened to it: `null` for a dry
 * run, a number for rows written, or the caller's own lines for a refusal.
 */
export function formatPlan(
  plan: BackfillPlan,
  outcome: number | null | string[],
): string[] {
  const counts = {
    moistureReading: 0,
    environmentalData: 0,
    inspectionPhoto: 0,
  };
  for (const row of plan.write) counts[row.plan.table] += 1;
  const clientPromoted = plan.report.filter(
    (row) => row.reason === "client-promoted",
  ).length;
  const digest = planDigest(plan);

  const lines = [
    `[ra-8388-backfill] inspection: ${plan.inspectionId}`,
    `[ra-8388-backfill] evidence items scanned: ${plan.scanned}`,
    `[ra-8388-backfill] rows to write: ${plan.write.length} (moisture ${counts.moistureReading}, ambient ${counts.environmentalData}, photo ${counts.inspectionPhoto})`,
    `[ra-8388-backfill] already present (skipped): ${plan.alreadyPresent}`,
    `[ra-8388-backfill] no authoritative table (notes, equipment logs, documents): ${plan.noAuthoritativeTable}`,
    `[ra-8388-backfill] client-promoted photographs (kept as evidence, never counted): ${clientPromoted}`,
    `[ra-8388-backfill] needs a person: ${plan.report.length - clientPromoted}`,
    `[ra-8388-backfill] plan digest: ${digest}`,
  ];
  if (Array.isArray(outcome)) {
    lines.push(...outcome);
  } else if (outcome === null) {
    lines.push(
      `[ra-8388-backfill] dry run — nothing written. To write exactly this plan: --apply --expect-plan ${digest}`,
    );
  } else {
    lines.push(`[ra-8388-backfill] rows written: ${outcome}`);
  }
  for (const row of plan.report) {
    lines.push(
      `  ${row.reason}\tevidence=${row.evidenceItemId}\tclass=${row.evidenceClass}\t${row.detail}`,
    );
  }
  return lines;
}

function valueAfter(argv: string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index === -1) return null;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) return null;
  return value;
}

export function inspectionIdFromArgv(argv: string[]): string | null {
  return valueAfter(argv, "--inspection");
}

export function expectedPlanFromArgv(argv: string[]): string | null {
  return valueAfter(argv, "--expect-plan");
}

/**
 * Find the inspection a person named, by internal id OR by job number.
 *
 * The job number (`inspectionNumber`, NIR-2026-11-B3F306) is what is on the
 * screen and in the ticket; the internal id is what every table is keyed
 * by. The script used to filter by whatever it was handed, so the job
 * number matched no rows and printed "0 scanned, 0 to write": a failed
 * lookup wearing the clothes of a clean result. `null` here means the
 * inspection does not exist, and the caller fails on it.
 */
export async function resolveInspection(
  value: string,
): Promise<{ id: string; inspectionNumber: string } | null> {
  return prisma.inspection.findFirst({
    where: { OR: [{ id: value }, { inspectionNumber: value }] },
    select: { id: true, inspectionNumber: true },
  });
}

export interface BackfillRunResult {
  /** False means the command must exit non-zero. */
  ok: boolean;
  plan: BackfillPlan | null;
  digest: string | null;
  created: CreatedRow[];
}

export async function runInspectionBackfill(
  argv: string[] = process.argv.slice(2),
  log: (line: string) => void = console.log,
): Promise<BackfillRunResult> {
  const failed = (
    plan: BackfillPlan | null = null,
    digest: string | null = null,
  ): BackfillRunResult => ({ ok: false, plan, digest, created: [] });

  const requested = inspectionIdFromArgv(argv);
  if (!requested) {
    log(
      "[ra-8388-backfill] --inspection <id> is required (the internal id or the job number). This script writes into insurance evidence and has no all-jobs mode.",
    );
    return failed();
  }

  const target = redactedDatabaseTarget();
  log(
    `[ra-8388-backfill] database host=${target.host} database=${target.database}`,
  );

  const inspection = await resolveInspection(requested);
  if (!inspection) {
    log(
      `[ra-8388-backfill] inspection not found: "${requested}" matches no inspection id and no job number in this database. Nothing was read and nothing was written.`,
    );
    return failed();
  }
  log(
    `[ra-8388-backfill] resolved "${requested}" to id=${inspection.id} job number=${inspection.inspectionNumber}`,
  );

  const plan = await planInspectionBackfill(inspection.id);
  const digest = planDigest(plan);

  if (!argv.includes("--apply")) {
    for (const line of formatPlan(plan, null)) log(line);
    return { ok: true, plan, digest, created: [] };
  }

  const expected = expectedPlanFromArgv(argv);
  if (!expected) {
    for (const line of formatPlan(plan, [
      "[ra-8388-backfill] REFUSED — nothing written. --apply needs --expect-plan <digest> from a dry run a person has read.",
    ])) {
      log(line);
    }
    return failed(plan, digest);
  }
  if (expected !== digest) {
    for (const line of formatPlan(plan, [
      `[ra-8388-backfill] REFUSED — nothing written. The plan now does not match the one that was approved (--expect-plan ${expected}). The job changed since the dry run, or this is a different checkout. Read this plan and run again with its digest.`,
    ])) {
      log(line);
    }
    return failed(plan, digest);
  }

  let created: CreatedRow[];
  try {
    created = await applyInspectionBackfill(plan, log);
  } catch (error) {
    log(
      "[ra-8388-backfill] FAILED part way. The rows listed above as created WERE written; nothing after them was. Do not delete them: run the dry run again and apply the new plan to finish.",
    );
    throw error;
  }
  for (const line of formatPlan(plan, created.length)) log(line);
  return { ok: true, plan, digest, created };
}

/** Run the CLI. Returns the process exit code; never calls process.exit. */
export async function main(): Promise<number> {
  let code: number;
  try {
    const result = await runInspectionBackfill();
    // A missing scope, an unknown inspection and a refused apply are all
    // failures. Exiting 0 on them is how a wrong job number read as
    // "already counted".
    code = result.ok ? 0 : 1;
  } catch (error) {
    console.error("[ra-8388-backfill] failed:", error);
    code = 1;
  }
  // Only a client this run initialised is disconnected; a failed cleanup is a failure.
  return (await disconnectCliPrisma()) ? code : 1;
}
